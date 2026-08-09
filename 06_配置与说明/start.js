import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, "../01_页面文件");
const frontendPort = Number(process.env.FRONTEND_PORT || 3001);

const mimeTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".mjs": "application/javascript; charset=utf-8"
};

function sendFile(res, targetPath) {
    const ext = path.extname(targetPath).toLowerCase();
    res.statusCode = 200;
    res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
    fs.createReadStream(targetPath).pipe(res);
}

function startFrontendServer() {
    const server = http.createServer((req, res) => {
        const requestPath = decodeURIComponent(String(req.url || "/").split("?")[0]);
        const normalizedPath = requestPath === "/" ? "/index.html" : requestPath;
        const targetPath = path.resolve(frontendRoot, `.${normalizedPath}`);

        if (!targetPath.startsWith(frontendRoot)) {
            res.statusCode = 403;
            res.end("Forbidden");
            return;
        }

        fs.stat(targetPath, (statError, stats) => {
            if (statError || !stats.isFile()) {
                res.statusCode = 404;
                res.end("Not Found");
                return;
            }

            sendFile(res, targetPath);
        });
    });

    server.on("error", (error) => {
        if (error && error.code === "EADDRINUSE") {
            console.log(`[ready] front-end: http://127.0.0.1:${frontendPort}/index.html (reuse)`);
            return;
        }

        console.error("[front-end] failed:", error);
    });

    server.listen(frontendPort, "127.0.0.1", () => {
        console.log(`[ready] front-end: http://127.0.0.1:${frontendPort}/index.html`);
    });
}

startFrontendServer();
await import("../04_后端服务/server.js");
