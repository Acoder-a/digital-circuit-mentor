import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { chunkPages } from "../src/knowledge/chunker.js";
import { classifyDocument } from "../src/knowledge/classify.js";
import { parsePdf } from "../src/knowledge/pdf-parser.js";
import { formatKnowledgeContext, publicSources } from "../src/rag-format.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("按章节切片并保持真值表和来源页码", () => {
    const table = "表 1-1 真值表\n输入 A B 输出 Y\n0 0 1\n0 1 1\n1 0 1\n1 1 0";
    const pages = [
        { pageNumber: 3, section: "实验一 集成逻辑门电路", text: `实验一 集成逻辑门电路\n\n一、实验原理\n${"与非门逻辑关系。".repeat(70)}\n\n${table}\n\n${"观察输出并记录实验结果。".repeat(35)}` },
        { pageNumber: 4, section: "三、实验步骤", text: `三、实验步骤\n${"连接 VCC 与 GND，检查无误后通电。".repeat(45)}` }
    ];
    const chunks = chunkPages(pages, { primaryType: "logic_gate" }, { minSize: 400, maxSize: 700, overlap: 100 });
    assert.ok(chunks.length >= 2);
    assert.ok(chunks.some((chunk) => chunk.content.includes(table)), "真值表必须完整保留在同一片段");
    assert.ok(chunks.every((chunk) => chunk.pageStart >= 3 && chunk.pageEnd <= 4));
    assert.ok(chunks.some((chunk) => chunk.knowledgeType === "truth_table"));
});

test("依据正文而不是文件名分类，并识别真实硬件资料", () => {
    const classification = classifyDocument("实验目的 实验步骤 74LS138 译码器 引脚 VCC GND 数码管 译码显示 74LS138");
    assert.equal(classification.primaryType, "decoder");
    assert.equal(classification.realHardware, true);
    assert.equal(classification.documentKind, "course_material");
});

test("真实 PDF 可逐页解析且同内容异名资料可由哈希去重", async () => {
    const basic = path.join(root, "knowledge", "基础逻辑门实验指导.pdf");
    const alias = path.join(root, "knowledge", "元器件大全.pdf");
    const guide = path.join(root, "knowledge", "实验指导书2.pdf");
    const [parsed, guideParsed, a, b] = await Promise.all([parsePdf(basic, { ocrEnabled: false }), parsePdf(guide, { ocrEnabled: false }), fs.readFile(basic), fs.readFile(alias)]);
    assert.equal(parsed.pageCount, 21);
    assert.match(parsed.pages.map((page) => page.text).join("\n"), /基本逻辑门|逻辑实验/);
    assert.deepEqual(a, b, "两个异名 PDF 的实际二进制内容相同，应只向量化一次");
    const guideText = guideParsed.pages.map((page) => page.text).join("\n");
    const chunks = chunkPages(guideParsed.pages, classifyDocument(guideText), { minSize: 400, maxSize: 700, overlap: 100 });
    const truthTable = chunks.find((chunk) => chunk.pageStart <= 4 && chunk.pageEnd >= 4 && /0\s+0\s+1\s+1[\s\S]*1\s+1\s+0\s+0/.test(chunk.content));
    assert.ok(truthTable, "实际资料第 4 页的 74LS00/74LS02 真值表应作为完整可检索片段存在");
    assert.equal(truthTable.knowledgeType, "truth_table");
});

test("RAG 上下文与公开来源包含文件、页码和章节", () => {
    const result = { chunks: [{ file_name: "实验指导书.pdf", page_start: 4, page_end: 4, section: "实验一", knowledge_type: "truth_table", content: "0 0 1", score: 0.81 }] };
    assert.match(formatKnowledgeContext(result), /实验指导书\.pdf，第4页/);
    assert.deepEqual(publicSources(result)[0], { fileName: "实验指导书.pdf", pageStart: 4, pageEnd: 4, section: "实验一", score: 0.81 });
});
