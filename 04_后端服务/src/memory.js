import { createHash } from "crypto";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { config } from "./config.js";
import { getPool, isDatabaseConfigured } from "./database.js";
import { getEmbeddings, toPgVector } from "./embeddings.js";

export async function getMemoryContext({ student, clientSessionId, question }) {
    if (!student || !isDatabaseConfigured()) return { recent: [], summary: "", longTerm: [] };
    const session = await ensureSession(student.id, clientSessionId);
    const recentResult = await getPool().query(
        `SELECT role,content FROM conversation_messages WHERE session_id=$1
         ORDER BY created_at DESC,id DESC LIMIT $2`,
        [session.id, config.memoryRecentPairs * 2]
    );
    const summaryResult = await getPool().query("SELECT summary FROM conversation_summaries WHERE session_id=$1", [session.id]);
    const longTerm = student.memory_enabled ? await recallLongTerm(student.id, question) : [];
    return {
        session,
        recent: recentResult.rows.reverse(),
        summary: summaryResult.rows[0]?.summary || "",
        longTerm
    };
}

export function memoryMessages(context) {
    return context.recent.map((entry) => entry.role === "assistant"
        ? new AIMessage(entry.content)
        : new HumanMessage(entry.content));
}

export function formatLongTermMemories(context) {
    if (!context.longTerm?.length) return "无相关个性化记忆。";
    return context.longTerm.map((item) => `- [${item.category}] ${item.content}`).join("\n");
}

export async function saveConversationTurn({ student, clientSessionId, experimentName, userContent, assistantContent, sources = [] }) {
    if (!student || !isDatabaseConfigured()) return;
    const session = await ensureSession(student.id, clientSessionId, experimentName);
    const result = await getPool().query(
        `INSERT INTO conversation_messages(session_id,role,content,metadata) VALUES
         ($1,'user',$2,$4::jsonb),($1,'assistant',$3,$5::jsonb) RETURNING id`,
        [session.id, userContent, assistantContent, JSON.stringify({ experimentName }), JSON.stringify({ sources })]
    );
    await getPool().query("UPDATE conversation_sessions SET updated_at=now(),experiment_type=$2 WHERE id=$1", [session.id, experimentName]);
    void updateProgress(student.id, experimentName).catch(logBackgroundError);
    if (student.memory_enabled) void extractMemories(student.id, userContent, assistantContent).catch(logBackgroundError);
    void maybeRefreshSummary(session.id, result.rows.at(-1)?.id).catch(logBackgroundError);
}

async function ensureSession(studentId, clientSessionId, experimentName = null) {
    const safeId = String(clientSessionId || "default").slice(0, 120) || "default";
    const result = await getPool().query(
        `INSERT INTO conversation_sessions(student_id,client_session_id,experiment_type)
         VALUES($1,$2,$3) ON CONFLICT(student_id,client_session_id)
         DO UPDATE SET updated_at=now() RETURNING *`,
        [studentId, safeId, experimentName]
    );
    return result.rows[0];
}

async function recallLongTerm(studentId, question) {
    const embedder = getEmbeddings();
    if (embedder) {
        try {
            const vector = toPgVector(await embedder.embedQuery(question));
            const result = await getPool().query(
                `SELECT id,category,content,importance,1-(embedding <=> $2::vector) AS relevance
                 FROM student_memories WHERE student_id=$1 AND active=true AND embedding IS NOT NULL
                 ORDER BY (0.8*(1-(embedding <=> $2::vector)) + 0.2*importance) DESC LIMIT $3`,
                [studentId, vector, config.memoryRecallK]
            );
            return result.rows;
        } catch (error) { console.error("[memory] vector recall fallback:", error.message); }
    }
    const result = await getPool().query(
        `SELECT id,category,content,importance FROM student_memories
         WHERE student_id=$1 AND active=true ORDER BY importance DESC,updated_at DESC LIMIT $2`,
        [studentId, config.memoryRecallK]
    );
    return result.rows;
}

async function extractMemories(studentId, question, answer) {
    const candidates = [];
    const text = `${question}\n${answer}`;
    if (/不懂|不会|容易错|总是错|搞不清|薄弱/.test(question)) candidates.push(["weakness", question, 0.75]);
    if (/答错|接错|连错|忘记|误认为|混淆/.test(question)) candidates.push(["common_error", question, 0.8]);
    if (/我喜欢|希望你|请用|讲慢|举例|图示|简洁/.test(question)) candidates.push(["preference", question, 0.65]);
    if (/完成|掌握|学会|通过|成功/.test(text)) candidates.push(["progress", question, 0.6]);
    if (/第一次|终于|独立完成|全部通过/.test(question)) candidates.push(["milestone", question, 0.85]);
    for (const [category, content, importance] of candidates) {
        const normalized = content.replace(/\s+/g, " ").trim().slice(0, 500);
        const fingerprint = createHash("sha256").update(`${category}:${normalized}`).digest("hex");
        let embedding = null;
        const embedder = getEmbeddings();
        if (embedder) {
            try { embedding = toPgVector(await embedder.embedQuery(normalized)); } catch (_error) { /* optional */ }
        }
        await getPool().query(
            `INSERT INTO student_memories(student_id,category,content,fingerprint,importance,embedding)
             VALUES($1,$2,$3,$4,$5,$6::vector)
             ON CONFLICT(student_id,fingerprint) DO UPDATE SET importance=GREATEST(student_memories.importance,EXCLUDED.importance),updated_at=now(),active=true`,
            [studentId, category, normalized, fingerprint, importance, embedding]
        );
    }
}

async function maybeRefreshSummary(sessionId, lastMessageId) {
    const count = await getPool().query("SELECT count(*)::int AS total FROM conversation_messages WHERE session_id=$1", [sessionId]);
    if (count.rows[0].total < config.memorySummaryThreshold) return;
    const messages = await getPool().query(
        `SELECT id,role,left(content,180) AS content FROM conversation_messages
         WHERE session_id=$1 ORDER BY created_at DESC,id DESC OFFSET $2 LIMIT 30`,
        [sessionId, config.memoryRecentPairs * 2]
    );
    if (!messages.rowCount) return;
    const ordered = messages.rows.reverse();
    const summary = ordered.map((m) => `${m.role === "user" ? "学生" : "助手"}：${m.content}`).join("\n").slice(0, 4000);
    const summarizedThrough = Math.max(...ordered.map((message) => Number(message.id)));
    await getPool().query(
        `INSERT INTO conversation_summaries(session_id,summary,summarized_through_message_id)
         VALUES($1,$2,$3) ON CONFLICT(session_id) DO UPDATE SET summary=EXCLUDED.summary,summarized_through_message_id=EXCLUDED.summarized_through_message_id,updated_at=now()`,
        [sessionId, `较早对话的提要：\n${summary}`, summarizedThrough || lastMessageId]
    );
}

async function updateProgress(studentId, experimentName) {
    const experiment = String(experimentName || "首页").slice(0, 80);
    await getPool().query(
        `INSERT INTO learning_progress(student_id,experiment_type,attempts,mastery) VALUES($1,$2,1,0.1)
         ON CONFLICT(student_id,experiment_type) DO UPDATE SET
            attempts=learning_progress.attempts+1,
            mastery=LEAST(0.95,learning_progress.mastery+0.05),
            status=CASE WHEN learning_progress.mastery>=0.75 THEN 'review' ELSE 'learning' END,
            updated_at=now()`,
        [studentId, experiment]
    );
}

function logBackgroundError(error) { console.error("[memory] background update failed:", error.message); }

export function profileRouter(express) {
    const router = express.Router();
    router.get("/profile", async (req, res) => {
        const [memories, progress, sessions] = await Promise.all([
            getPool().query("SELECT id,category,content,importance,active,updated_at FROM student_memories WHERE student_id=$1 ORDER BY updated_at DESC", [req.student.id]),
            getPool().query("SELECT experiment_type,status,attempts,mastery,last_state,updated_at FROM learning_progress WHERE student_id=$1 ORDER BY updated_at DESC", [req.student.id]),
            getPool().query("SELECT client_session_id,experiment_type,title,updated_at FROM conversation_sessions WHERE student_id=$1 ORDER BY updated_at DESC LIMIT 20", [req.student.id])
        ]);
        res.json({ student: req.student, memories: memories.rows, progress: progress.rows, sessions: sessions.rows });
    });
    router.patch("/profile", async (req, res) => {
        const displayName = String(req.body?.displayName || req.student.display_name).trim().slice(0, 80);
        const memoryEnabled = typeof req.body?.memoryEnabled === "boolean" ? req.body.memoryEnabled : req.student.memory_enabled;
        const result = await getPool().query("UPDATE students SET display_name=$2,memory_enabled=$3,updated_at=now() WHERE id=$1 RETURNING id,email,phone,display_name,memory_enabled", [req.student.id, displayName, memoryEnabled]);
        res.json({ student: result.rows[0] });
    });
    router.patch("/memories/:id", async (req, res) => {
        const content = String(req.body?.content || "").trim().slice(0, 500);
        if (!content) return res.status(400).json({ error: "记忆内容不能为空" });
        const current = await getPool().query("SELECT category FROM student_memories WHERE id=$1 AND student_id=$2", [req.params.id, req.student.id]);
        if (!current.rowCount) return res.status(404).json({ error: "记忆不存在" });
        const fingerprint = createHash("sha256").update(`${current.rows[0].category}:${content}`).digest("hex");
        let embedding = null;
        const embedder = getEmbeddings();
        if (embedder) {
            try { embedding = toPgVector(await embedder.embedQuery(content)); } catch (_error) { /* keep memory editable if embedding is unavailable */ }
        }
        const result = await getPool().query(
            "UPDATE student_memories SET content=$3,fingerprint=$4,embedding=$5::vector,updated_at=now() WHERE id=$1 AND student_id=$2 RETURNING *",
            [req.params.id, req.student.id, content, fingerprint, embedding]
        );
        if (!result.rowCount) return res.status(404).json({ error: "记忆不存在" });
        res.json({ memory: result.rows[0] });
    });
    router.delete("/memories/:id", async (req, res) => {
        const result = await getPool().query("DELETE FROM student_memories WHERE id=$1 AND student_id=$2", [req.params.id, req.student.id]);
        res.status(result.rowCount ? 200 : 404).json(result.rowCount ? { ok: true } : { error: "记忆不存在" });
    });
    return router;
}
