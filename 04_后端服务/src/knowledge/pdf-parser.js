import fs from "fs/promises";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { config } from "../config.js";
import { isHeading } from "./chunker.js";

function run(command, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { windowsHide: true });
        let stderr = "";
        child.stderr.on("data", (data) => { stderr += String(data); });
        child.on("error", reject);
        child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} failed (${code}): ${stderr}`)));
    });
}

async function extractPageText(page) {
    const content = await page.getTextContent();
    const lines = [];
    let current = [];
    let lastY = null;
    for (const item of content.items) {
        const y = Math.round(item.transform?.[5] || 0);
        if (lastY !== null && Math.abs(y - lastY) > 3) {
            lines.push(current.join(" ").replace(/\s+/g, " ").trim());
            current = [];
        }
        current.push(item.str);
        lastY = y;
    }
    if (current.length) lines.push(current.join(" ").replace(/\s+/g, " ").trim());
    return lines.filter(Boolean).join("\n");
}

async function ocrPage(pdfPath, pageNumber) {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dcm-ocr-"));
    const prefix = path.join(tempDir, "page");
    const png = `${prefix}.png`;
    try {
        await run("pdftoppm", ["-f", String(pageNumber), "-l", String(pageNumber), "-singlefile", "-png", "-r", "200", pdfPath, prefix]);
        return await new Promise((resolve, reject) => {
            const child = spawn("tesseract", [png, "stdout", "-l", config.ocrLanguage], { windowsHide: true });
            let output = "";
            child.stdout.on("data", (data) => { output += String(data); });
            child.on("error", reject);
            child.on("exit", (code) => code === 0 ? resolve(output.trim()) : reject(new Error(`tesseract failed (${code})`)));
        });
    } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
    }
}

export async function parsePdf(pdfPath, options = {}) {
    const data = new Uint8Array(await fs.readFile(pdfPath));
    const pdf = await getDocument({ data, useSystemFonts: true }).promise;
    const metadata = await pdf.getMetadata().catch(() => ({ info: {} }));
    const pages = [];
    let currentSection = "";
    let ocrPages = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        let text = await extractPageText(page);
        let usedOcr = false;
        if (text.replace(/\s/g, "").length < 40 && (options.ocrEnabled ?? config.ocrEnabled)) {
            try { text = await ocrPage(pdfPath, pageNumber); usedOcr = Boolean(text); } catch (error) {
                console.warn(`[knowledge] OCR page ${pageNumber} skipped: ${error.message}`);
            }
        }
        const heading = text.split(/\r?\n/).map((line) => line.trim()).find(isHeading);
        if (heading) currentSection = heading;
        if (usedOcr) ocrPages += 1;
        pages.push({ pageNumber, text, section: currentSection, usedOcr });
    }
    const metadataTitle = String(metadata.info?.Title || "").trim();
    const titleCandidates = pages.slice(0, 2).flatMap((page) => page.text.split(/\r?\n/))
        .map((line) => line.trim()).filter((line) => line.length >= 4 && line.length <= 50);
    const combinedGuideTitle = titleCandidates.includes("数字逻辑基础") && titleCandidates.some((line) => /实验指导书/.test(line))
        ? "数字逻辑基础实验指导书" : "";
    const contentTitle = combinedGuideTitle || titleCandidates.find((line) => /实验指导书|数字.*实验|电子线路实验|数字逻辑基础/.test(line));
    const title = contentTitle
        || (!/\.(docx?|pptx?)$/i.test(metadataTitle) ? metadataTitle : "")
        || titleCandidates[0]
        || path.basename(pdfPath, path.extname(pdfPath));
    return { title, pageCount: pdf.numPages, pages, ocrPages, metadata: metadata.info || {} };
}
