import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import { fileURLToPath } from "url";
import { config } from "../src/config.js";
import { getEmbeddings, toPgVector } from "../src/embeddings.js";
import { parsePdf } from "../src/knowledge/pdf-parser.js";
import { classifyDocument } from "../src/knowledge/classify.js";
import { chunkPages } from "../src/knowledge/chunker.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const sourceArg = process.argv.find((arg, index) => index > 1 && !arg.startsWith("--")) || "../knowledge";
const sourceDir = path.resolve(process.cwd(), sourceArg);
const dryRun = process.argv.includes("--dry-run");
let database = null;
const dryRunHashes = new Map();

async function sha256(filePath) {
    return createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
}

async function importPdf(filePath) {
    const fileName = path.basename(filePath);
    const fileHash = await sha256(filePath);
    if (dryRun && dryRunHashes.has(fileHash)) {
        console.log(`\n${fileName}: 与 ${dryRunHashes.get(fileHash)} 内容哈希相同，正式导入时将登记重复来源并跳过向量化`);
        return;
    }
    dryRunHashes.set(fileHash, fileName);
    const parsed = await parsePdf(filePath);
    const fullText = parsed.pages.map((page) => page.text).join("\n");
    const classification = classifyDocument(fullText);
    const chunks = chunkPages(parsed.pages, classification, {
        minSize: config.knowledgeChunkMin,
        maxSize: config.knowledgeChunkMax,
        overlap: config.knowledgeChunkOverlap
    });
    console.log(`\n${fileName}: ${parsed.pageCount}页 / ${fullText.length}字 / ${chunks.length}块 / OCR ${parsed.ocrPages}页`);
    console.log(`  标题：${parsed.title}`);
    console.log(`  分类：${classification.documentKind}；实验：${classification.experimentTypes.join(", ")}`);
    if (dryRun) return;

    const pool = database.getPool();
    const existing = await pool.query("SELECT id,file_hash,duplicate_of FROM knowledge_documents WHERE source_path=$1", [filePath]);
    if (existing.rows[0]?.file_hash === fileHash && !existing.rows[0]?.duplicate_of) {
        console.log("  未变化，跳过");
        return;
    }
    const duplicate = await pool.query("SELECT id,file_name FROM knowledge_documents WHERE file_hash=$1 AND source_path<>$2 LIMIT 1", [fileHash, filePath]);
    if (duplicate.rows[0]) {
        await pool.query(
            `INSERT INTO knowledge_documents(source_path,file_name,file_hash,title,classification,page_count,duplicate_of,indexed_at)
             VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,now())
             ON CONFLICT(source_path) DO UPDATE SET file_hash=EXCLUDED.file_hash,title=EXCLUDED.title,classification=EXCLUDED.classification,page_count=EXCLUDED.page_count,duplicate_of=EXCLUDED.duplicate_of,indexed_at=now(),updated_at=now()`,
            [filePath, fileName, fileHash, parsed.title, JSON.stringify(classification), parsed.pageCount, duplicate.rows[0].id]
        );
        if (existing.rows[0]?.id) await pool.query("DELETE FROM knowledge_chunks WHERE document_id=$1", [existing.rows[0].id]);
        console.log(`  与 ${duplicate.rows[0].file_name} 内容相同，登记别名并跳过向量化`);
        return;
    }
    const embedder = getEmbeddings();
    if (!embedder) throw new Error("DASHSCOPE_API_KEY 未配置，无法生成 Embedding");
    const vectors = await embedder.embedDocuments(chunks.map((chunk) => chunk.content));
    await database.withTransaction(async (client) => {
        const document = await client.query(
            `INSERT INTO knowledge_documents(source_path,file_name,file_hash,title,classification,page_count,indexed_at)
             VALUES($1,$2,$3,$4,$5::jsonb,$6,now())
             ON CONFLICT(source_path) DO UPDATE SET file_hash=EXCLUDED.file_hash,title=EXCLUDED.title,classification=EXCLUDED.classification,page_count=EXCLUDED.page_count,duplicate_of=NULL,indexed_at=now(),updated_at=now()
             RETURNING id`,
            [filePath, fileName, fileHash, parsed.title, JSON.stringify(classification), parsed.pageCount]
        );
        await client.query("DELETE FROM knowledge_chunks WHERE document_id=$1", [document.rows[0].id]);
        for (let index = 0; index < chunks.length; index += 1) {
            const chunk = chunks[index];
            await client.query(
                `INSERT INTO knowledge_chunks(document_id,chunk_index,content,content_hash,page_start,page_end,section,experiment_type,knowledge_type,source_kind,embedding,metadata)
                 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::vector,$12::jsonb)`,
                [document.rows[0].id, chunk.chunkIndex, chunk.content, chunk.contentHash, chunk.pageStart, chunk.pageEnd, chunk.section,
                    chunk.experimentType, chunk.knowledgeType, classification.documentKind, toPgVector(vectors[index]),
                    JSON.stringify({ originalFileName: fileName, realHardware: classification.realHardware })]
            );
        }
    });
    console.log(`  已写入 ${chunks.length} 个向量片段`);
}

try {
    const entries = (await fs.readdir(sourceDir, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"));
    if (!entries.length) throw new Error(`目录中没有 PDF：${sourceDir}`);
    if (!dryRun) {
        database = await import("../src/database.js");
        await database.initDatabase();
    }
    console.log(`${dryRun ? "检查" : "导入"}目录：${sourceDir}`);
    for (const entry of entries) await importPdf(path.join(sourceDir, entry.name));
    console.log("\n知识库处理完成");
} catch (error) {
    console.error("\n知识库处理失败：", error.stack || error.message);
    process.exitCode = 1;
} finally {
    if (!dryRun) await database?.getPool()?.end();
}
