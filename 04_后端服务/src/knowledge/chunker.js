import { createHash } from "crypto";
import { classifyChunk } from "./classify.js";

const atomicPattern = /(真值表|表\s*\d|引脚|管脚|逻辑表达式|实验步骤|操作步骤|实验过程)/;

export function isHeading(line) {
    const value = String(line || "").trim();
    if (value.length < 2 || value.length > 60) return false;
    if (/^(?:第[一二三四五六七八九十百0-9]+[章节]|实验[一二三四五六七八九十0-9]+|【[^】]{2,30}】)/.test(value)) return true;
    if (value.length <= 32 && /^(?:[一二三四五六七八九十]+[、．.]|\d+(?:\.\d+)*[、.．]\s*)\S/.test(value)) return true;
    return false;
}

function pageBlocks(page) {
    const lines = String(page.text || "").split(/\r?\n/).map((line) => line.trimEnd());
    const blocks = [];
    let buffer = [];
    let section = page.section || "";
    const flush = () => {
        const text = buffer.join("\n").trim();
        if (text) blocks.push({ text, page: page.pageNumber, section, atomic: atomicPattern.test(text) });
        buffer = [];
    };
    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) { flush(); continue; }
        if (isHeading(line)) {
            flush();
            section = line;
            blocks.push({ text: line, page: page.pageNumber, section, atomic: true, heading: true });
            continue;
        }
        buffer.push(line);
    }
    flush();
    return blocks;
}

function splitOversizedBlock(block, maxSize) {
    if (block.text.length <= maxSize || block.atomic) return [block];
    const sentences = block.text.split(/(?<=[。！？；\n])/).filter(Boolean);
    const pieces = [];
    let text = "";
    for (const sentence of sentences) {
        if (text && text.length + sentence.length > maxSize) {
            pieces.push({ ...block, text: text.trim() });
            text = "";
        }
        text += sentence;
    }
    if (text.trim()) pieces.push({ ...block, text: text.trim() });
    return pieces;
}

export function chunkPages(pages, classification, options = {}) {
    const minSize = Number(options.minSize || 400);
    const maxSize = Math.max(minSize, Number(options.maxSize || 700));
    const overlap = Math.min(Number(options.overlap || 100), Math.floor(maxSize / 2));
    const blocks = pages.flatMap(pageBlocks).flatMap((block) => splitOversizedBlock(block, maxSize));
    const chunks = [];
    let current = [];
    let currentLength = 0;

    const flush = () => {
        if (!current.length) return;
        const content = current.map((block) => block.text).join("\n\n").trim();
        const first = current[0];
        const last = current[current.length - 1];
        const local = classifyChunk(content, classification);
        chunks.push({
            content,
            contentHash: createHash("sha256").update(content).digest("hex"),
            pageStart: first.page,
            pageEnd: last.page,
            section: [...current].reverse().find((block) => block.section)?.section || "",
            ...local
        });
        const tail = [];
        let tailLength = 0;
        for (let i = current.length - 1; i >= 0 && tailLength < overlap; i -= 1) {
            if (current[i].heading && tail.length) continue;
            tail.unshift(current[i]);
            tailLength += current[i].text.length;
        }
        current = tail;
        currentLength = tailLength;
    };

    for (const block of blocks) {
        const nextLength = currentLength + block.text.length + 2;
        const sectionChanged = current.length && block.heading && currentLength >= minSize;
        if ((nextLength > maxSize && currentLength >= minSize) || sectionChanged) flush();
        current.push(block);
        currentLength += block.text.length + 2;
        if (currentLength > maxSize * 1.65 && block.atomic) flush();
    }
    if (current.length) flush();
    return chunks.map((chunk, index) => ({ ...chunk, chunkIndex: index }));
}
