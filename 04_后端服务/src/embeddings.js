import { OpenAIEmbeddings } from "@langchain/openai";
import { config } from "./config.js";

let embeddings = null;

export function getEmbeddings() {
    const apiKey = String(process.env.DASHSCOPE_API_KEY || "").trim();
    if (!apiKey) return null;
    if (!embeddings) {
        embeddings = new OpenAIEmbeddings({
            model: config.embeddingModel,
            dimensions: config.embeddingDimensions,
            apiKey,
            configuration: {
                baseURL: String(process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1").trim()
            }
        });
    }
    return embeddings;
}

export function toPgVector(values) {
    if (!Array.isArray(values) || !values.length) return null;
    return `[${values.map((value) => Number(value).toFixed(8)).join(",")}]`;
}
