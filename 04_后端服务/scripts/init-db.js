import "dotenv/config";
import { initDatabase, getPool } from "../src/database.js";

try {
    const status = await initDatabase();
    console.log("数据库初始化完成", status);
} catch (error) {
    console.error("数据库初始化失败：", error.message);
    process.exitCode = 1;
} finally {
    await getPool()?.end();
}
