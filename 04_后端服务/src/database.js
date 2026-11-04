import fs from "fs/promises";
import { config } from "./config.js";

// 仅在启用数据库时加载驱动，保留未配置数据库的本地演示模式。
let Pool;
if (config.databaseUrl) {
    ({ Pool } = (await import("pg")).default);
}
let pool = null;
let initialized = false;
let lastError = null;

export function isDatabaseConfigured() {
    return Boolean(config.databaseUrl);
}

export function getPool() {
    if (!pool && isDatabaseConfigured()) {
        pool = new Pool({
            connectionString: config.databaseUrl,
            ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
            max: Number(process.env.DATABASE_POOL_SIZE || 10)
        });
        pool.on("error", (error) => {
            lastError = error;
            console.error("[database] pool error:", error.message);
        });
    }
    return pool;
}

export async function initDatabase() {
    if (initialized) return { configured: true, ready: true };
    const activePool = getPool();
    if (!activePool) return { configured: false, ready: false };
    try {
        const schemaTemplate = await fs.readFile(config.schemaPath, "utf8");
        const schema = schemaTemplate.replaceAll("vector(1024)", `vector(${config.embeddingDimensions})`);
        await activePool.query(schema);
        initialized = true;
        lastError = null;
        return { configured: true, ready: true };
    } catch (error) {
        lastError = error;
        throw error;
    }
}

export async function databaseStatus() {
    const activePool = getPool();
    if (!activePool) return { configured: false, ready: false, detail: "DATABASE_URL 未配置" };
    try {
        await activePool.query("SELECT 1");
        return { configured: true, ready: initialized, detail: initialized ? "ok" : "schema not initialized" };
    } catch (error) {
        return { configured: true, ready: false, detail: error.message };
    }
}

export async function withTransaction(callback) {
    const client = await getPool().connect();
    try {
        await client.query("BEGIN");
        const result = await callback(client);
        await client.query("COMMIT");
        return result;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export function databaseLastError() {
    return lastError?.message || null;
}
