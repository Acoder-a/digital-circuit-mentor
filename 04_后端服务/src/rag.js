import { config } from "./config.js";
import { getPool, isDatabaseConfigured } from "./database.js";
import { getEmbeddings, toPgVector } from "./embeddings.js";
export { formatKnowledgeContext, publicSources } from "./rag-format.js";

function normalizeExperiment(value) {
    const text = String(value || "").toLowerCase();
    if (/逻辑门|gate|实验一/.test(text)) return "logic_gate";
    if (/半加器|加法器|half.?adder|实验二/.test(text)) return "adder";
    if (/译码|decoder|实验三/.test(text)) return "decoder";
    if (/触发器|flip.?flop|实验四/.test(text)) return "flip_flop";
    return null;
}
function queryTerms(question) {
    const raw = String(question || "");
    const phrases = raw.match(/[A-Za-z0-9]{2,}|[\u4e00-\u9fff]{2,6}/g) || [];
    const chineseBigrams = [...raw.replace(/[^\u4e00-\u9fff]/g, "")].map((char, index, chars) => `${char}${chars[index + 1] || ""}`).filter((term) => term.length === 2);
    return [...new Set([...phrases, ...chineseBigrams])].slice(0, 16);
}

function lexicalBonus(content, terms) {
    if (!terms.length) return 0;
    const hits = terms.filter((term) => content.toLowerCase().includes(term.toLowerCase())).length;
    return hits / terms.length;
}

export async function retrieveKnowledge(question, experimentName) {
    if (!config.ragEnabled || !isDatabaseConfigured()) return { chunks: [], sufficient: false, reason: "RAG 未配置" };
    const experimentType = normalizeExperiment(experimentName);
    const terms = queryTerms(question);
    let vector = null;
    const embedder = getEmbeddings();
    if (embedder) {
        try { vector = toPgVector(await embedder.embedQuery(question)); } catch (error) {
            console.error("[rag] query embedding failed, keyword fallback:", error.message);
        }
    }

    const result = vector
        ? await getPool().query(
            `SELECT k.id,k.content,k.page_start,k.page_end,k.section,k.experiment_type,k.knowledge_type,
                    k.source_kind,d.file_name,d.title,
                    1-(k.embedding <=> $1::vector) AS vector_score,
                    similarity(k.content,$2) AS keyword_score
             FROM knowledge_chunks k JOIN knowledge_documents d ON d.id=k.document_id
             WHERE k.embedding IS NOT NULL AND ($3::text IS NULL OR k.experiment_type=$3 OR k.experiment_type='general')
             ORDER BY (0.72*(1-(k.embedding <=> $1::vector)) + 0.28*similarity(k.content,$2)) DESC
             LIMIT $4`,
            [vector, question, experimentType, config.ragInitialK]
        )
        : await getPool().query(
            `SELECT k.id,k.content,k.page_start,k.page_end,k.section,k.experiment_type,k.knowledge_type,
                    k.source_kind,d.file_name,d.title,0::real AS vector_score,similarity(k.content,$1) AS keyword_score
             FROM knowledge_chunks k JOIN knowledge_documents d ON d.id=k.document_id
             WHERE ($2::text IS NULL OR k.experiment_type=$2 OR k.experiment_type='general')
             ORDER BY similarity(k.content,$1) DESC LIMIT $3`,
            [question, experimentType, config.ragInitialK]
        );

    const ranked = result.rows.map((row) => {
        const score = Number(row.vector_score || 0) * 0.68 + Number(row.keyword_score || 0) * 0.22
            + lexicalBonus(row.content, terms) * 0.1;
        return { ...row, score };
    }).sort((a, b) => b.score - a.score).slice(0, config.ragFinalK);
    return {
        chunks: ranked,
        sufficient: ranked.length > 0 && ranked[0].score >= config.ragMinScore,
        reason: ranked.length ? null : "知识库中没有匹配片段"
    };
}
