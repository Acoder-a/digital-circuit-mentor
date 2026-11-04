import path from "path";
import { fileURLToPath } from "url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

function integer(name, fallback, minimum = 0) {
    const value = Number.parseInt(process.env[name] || "", 10);
    return Number.isFinite(value) ? Math.max(minimum, value) : fallback;
}

export const config = {
    databaseUrl: String(process.env.DATABASE_URL || "").trim(),
    databaseSsl: String(process.env.DATABASE_SSL || "false").toLowerCase() === "true",
    schemaPath: path.resolve(currentDir, "../db/schema.sql"),
    embeddingModel: String(process.env.EMBEDDING_MODEL_ID || "text-embedding-v3").trim(),
    embeddingDimensions: integer("EMBEDDING_DIMENSIONS", 1024, 1),
    ragEnabled: String(process.env.RAG_ENABLED || "true").toLowerCase() !== "false",
    ragInitialK: integer("RAG_INITIAL_K", 8, 1),
    ragFinalK: integer("RAG_FINAL_K", 4, 1),
    ragMinScore: Number(process.env.RAG_MIN_SCORE || 0.18),
    memoryRecentPairs: integer("MEMORY_RECENT_PAIRS", 8, 1),
    memorySummaryThreshold: integer("MEMORY_SUMMARY_THRESHOLD", 20, 6),
    memoryRecallK: integer("MEMORY_RECALL_K", 4, 1),
    authSessionDays: integer("AUTH_SESSION_DAYS", 30, 1),
    knowledgeChunkMin: integer("KNOWLEDGE_CHUNK_MIN", 400, 100),
    knowledgeChunkMax: integer("KNOWLEDGE_CHUNK_MAX", 700, 200),
    knowledgeChunkOverlap: integer("KNOWLEDGE_CHUNK_OVERLAP", 100, 0),
    ocrEnabled: String(process.env.KNOWLEDGE_OCR_ENABLED || "true").toLowerCase() !== "false",
    ocrLanguage: String(process.env.KNOWLEDGE_OCR_LANGUAGE || "chi_sim+eng").trim()
};
