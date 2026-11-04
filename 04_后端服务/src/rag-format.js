export function formatKnowledgeContext(result) {
    if (!result?.chunks?.length) return "课程知识库未检索到可用片段。";
    return result.chunks.map((chunk, index) => {
        const pages = chunk.page_start === chunk.page_end ? `第${chunk.page_start}页` : `第${chunk.page_start}-${chunk.page_end}页`;
        return `[资料${index + 1}] ${chunk.file_name}，${pages}，章节：${chunk.section || "未标注"}，类型：${chunk.knowledge_type || "正文"}\n${chunk.content}`;
    }).join("\n\n");
}

export function publicSources(result) {
    return (result?.chunks || []).map((chunk) => ({
        fileName: chunk.file_name,
        pageStart: chunk.page_start,
        pageEnd: chunk.page_end,
        section: chunk.section,
        score: Number(chunk.score.toFixed(3))
    }));
}
