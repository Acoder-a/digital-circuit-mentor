import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { getPool, isDatabaseConfigured, withTransaction } from "./database.js";
import { config } from "./config.js";
import { consumeVerification, sendVerification, validPhone } from "./sms.js";

function hashToken(token) {
    return createHash("sha256").update(token).digest("hex");
}

function readToken(req) {
    const header = String(req.headers.authorization || "");
    const bearer = header.match(/^Bearer\s+(.+)$/i)?.[1];
    return String(bearer || "").trim();
}

export async function optionalAuth(req, _res, next) {
    req.student = null;
    const token = readToken(req);
    if (!token || !isDatabaseConfigured()) return next();
    try {
        const result = await getPool().query(
            `SELECT s.id, s.email, s.phone, s.display_name, s.memory_enabled
             FROM auth_sessions a
             JOIN students s ON s.id = a.student_id
             WHERE a.token_hash = $1 AND a.expires_at > now()`,
            [hashToken(token)]
        );
        req.student = result.rows[0] || null;
    } catch (error) {
        console.error("[auth] token lookup failed:", error.message);
    }
    next();
}

export function requireAuth(req, res, next) {
    if (!req.student) return res.status(401).json({ error: "请先登录学生账号" });
    next();
}

export function authRouter(express) {
    const router = express.Router();

    router.post("/sms/send", sendVerification);

    router.post("/register", async (req, res) => {
        if (!isDatabaseConfigured()) return res.status(503).json({ error: "数据库尚未配置" });
        const email = String(req.body?.email || "").trim().toLowerCase();
        const phone = String(req.body?.phone || "").trim();
        const code = String(req.body?.code || "").trim();
        const password = String(req.body?.password || "");
        const displayName = String(req.body?.displayName || "").trim().slice(0, 80);
        if (phone ? !validPhone(phone) : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ error: phone ? "手机号格式不正确" : "邮箱格式不正确" });
        }
        if (password.length < 8) return res.status(400).json({ error: "密码至少需要 8 位" });
        if (!displayName) return res.status(400).json({ error: "请输入姓名或昵称" });
        try {
            const passwordHash = await bcrypt.hash(password, 12);
            const student = await withTransaction(async (client) => {
                if (phone && !(await consumeVerification(client, phone, "register", code))) return null;
                const result = await client.query(
                    `INSERT INTO students(email,phone,phone_verified_at,password_hash,display_name)
                     VALUES($1,$2,$3,$4,$5) RETURNING id,email,phone,display_name,memory_enabled,created_at`,
                    [phone ? null : email, phone || null, phone ? new Date() : null, passwordHash, displayName]
                );
                return result.rows[0];
            });
            if (!student) return res.status(400).json({ error: "验证码错误或已过期" });
            const session = await createSession(student.id);
            res.status(201).json({ student: pickStudent(student), ...session });
        } catch (error) {
            if (error.code === "23505") return res.status(409).json({ error: phone ? "该手机号已经注册" : "该邮箱已经注册" });
            throw error;
        }
    });

    router.post("/login", async (req, res) => {
        if (!isDatabaseConfigured()) return res.status(503).json({ error: "数据库尚未配置" });
        const account = String(req.body?.phone || req.body?.email || "").trim().toLowerCase();
        const password = String(req.body?.password || "");
        const result = await getPool().query("SELECT * FROM students WHERE phone=$1 OR email=$1", [account]);
        const student = result.rows[0];
        if (!student || !(await bcrypt.compare(password, student.password_hash))) {
            return res.status(401).json({ error: "账号或密码错误" });
        }
        const session = await createSession(student.id);
        res.json({
            student: pickStudent(student),
            ...session
        });
    });

    router.post("/password/reset", async (req, res) => {
        if (!isDatabaseConfigured()) return res.status(503).json({ error: "数据库尚未配置" });
        const phone = String(req.body?.phone || "").trim();
        const code = String(req.body?.code || "").trim();
        const password = String(req.body?.password || "");
        if (!validPhone(phone)) return res.status(400).json({ error: "手机号格式不正确" });
        if (password.length < 8) return res.status(400).json({ error: "新密码至少需要 8 位" });
        const passwordHash = await bcrypt.hash(password, 12);
        const updated = await withTransaction(async (client) => {
            const student = await client.query("SELECT id FROM students WHERE phone=$1 FOR UPDATE", [phone]);
            if (!student.rowCount) return false;
            if (!(await consumeVerification(client, phone, "reset", code))) return false;
            await client.query("UPDATE students SET password_hash=$1, updated_at=now() WHERE id=$2", [passwordHash, student.rows[0].id]);
            await client.query("DELETE FROM auth_sessions WHERE student_id=$1", [student.rows[0].id]);
            return true;
        });
        if (!updated) return res.status(400).json({ error: "验证码错误或已过期" });
        res.json({ ok: true, message: "密码已重置，请重新登录" });
    });

    router.post("/logout", requireAuth, async (req, res) => {
        const token = readToken(req);
        if (token) await getPool().query("DELETE FROM auth_sessions WHERE token_hash=$1", [hashToken(token)]);
        res.json({ ok: true });
    });

    router.get("/me", requireAuth, (req, res) => res.json({ student: pickStudent(req.student) }));
    return router;
}

async function createSession(studentId) {
    const accessToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + config.authSessionDays * 86400000);
    await getPool().query(
        "INSERT INTO auth_sessions(student_id,token_hash,expires_at) VALUES($1,$2,$3)",
        [studentId, hashToken(accessToken), expiresAt]
    );
    return { accessToken, expiresAt: expiresAt.toISOString() };
}

function pickStudent(student) {
    return {
        id: student.id,
        email: student.email,
        phone: student.phone,
        displayName: student.display_name,
        memoryEnabled: student.memory_enabled,
        createdAt: student.created_at
    };
}
