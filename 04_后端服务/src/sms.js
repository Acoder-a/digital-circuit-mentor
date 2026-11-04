import { createHmac, randomInt } from "crypto";
import { createRequire } from "module";
import { getPool, isDatabaseConfigured } from "./database.js";

const require = createRequire(import.meta.url);
const phonePattern = /^1[3-9]\d{9}$/;
const purposes = new Set(["register", "reset"]);
const devMode = process.env.NODE_ENV !== "production" && process.env.SMS_DEV_MODE === "true";

export function validPhone(phone) {
    return phonePattern.test(String(phone || ""));
}

function codeHash(phone, purpose, code) {
    const secret = process.env.SMS_CODE_SECRET;
    if (!secret || secret.length < 24) throw new Error("SMS_CODE_SECRET 未配置或长度不足 24 位");
    return createHmac("sha256", secret).update(`${phone}:${purpose}:${code}`).digest("hex");
}

function smsReady() {
    if (!process.env.SMS_CODE_SECRET || process.env.SMS_CODE_SECRET.length < 24) return false;
    if (devMode) return true;
    return Boolean(process.env.ALIBABA_CLOUD_ACCESS_KEY_ID && process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET &&
        process.env.ALIYUN_SMS_SIGN_NAME && process.env.ALIYUN_SMS_TEMPLATE_CODE);
}

async function deliverSms(phone, code) {
    if (devMode) {
        return { devCode: code };
    }
    const Dysmsapi = require("@alicloud/dysmsapi20170525");
    const OpenApi = require("@alicloud/openapi-client");
    const client = new Dysmsapi.default(new OpenApi.Config({
        accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
        accessKeySecret: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
        endpoint: "dysmsapi.aliyuncs.com"
    }));
    const request = new Dysmsapi.SendSmsRequest({
        phoneNumbers: phone,
        signName: process.env.ALIYUN_SMS_SIGN_NAME,
        templateCode: process.env.ALIYUN_SMS_TEMPLATE_CODE,
        templateParam: JSON.stringify({ code })
    });
    const result = await client.sendSms(request);
    if (result.body?.code !== "OK") throw new Error(`短信服务发送失败：${result.body?.code || "unknown"}`);
    return {};
}

export async function sendVerification(req, res) {
    if (!isDatabaseConfigured()) return res.status(503).json({ error: "数据库尚未配置，暂时无法发送验证码" });
    if (devMode && !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress)) {
        return res.status(403).json({ error: "开发验证码仅允许从本机获取" });
    }
    if (!smsReady()) return res.status(503).json({ error: "短信服务尚未配置，请联系管理员" });
    const phone = String(req.body?.phone || "").trim();
    const purpose = String(req.body?.purpose || "").trim();
    if (!validPhone(phone) || !purposes.has(purpose)) return res.status(400).json({ error: "手机号或验证码用途无效" });

    const pool = getPool();
    const existing = await pool.query("SELECT 1 FROM students WHERE phone=$1", [phone]);
    if (purpose === "register" && existing.rowCount) return res.status(409).json({ error: "该手机号已经注册，请直接登录" });
    if (purpose === "reset" && !existing.rowCount) return res.json({ ok: true, message: "如果该手机号已注册，验证码将发送至手机" });

    const ip = req.socket.remoteAddress || null;
    const limits = await pool.query(
        `SELECT count(*) FILTER (WHERE phone=$1) AS phone_count,
                count(*) FILTER (WHERE requester_ip=$2::inet) AS ip_count
         FROM sms_send_events WHERE created_at > now() - interval '1 hour'`, [phone, ip]
    );
    if (Number(limits.rows[0].phone_count) >= 5 || Number(limits.rows[0].ip_count) >= 20) {
        return res.status(429).json({ error: "验证码发送过于频繁，请稍后再试" });
    }
    const code = String(randomInt(100000, 1000000));
    const hash = codeHash(phone, purpose, code);
    const reserved = await pool.query(
        `INSERT INTO sms_verifications(phone,purpose,code_hash,attempts,sent_at,expires_at)
         VALUES($1,$2,$3,0,now(),now() + interval '5 minutes')
         ON CONFLICT(phone,purpose) DO UPDATE SET code_hash=EXCLUDED.code_hash, attempts=0,
             sent_at=EXCLUDED.sent_at, expires_at=EXCLUDED.expires_at
         WHERE sms_verifications.sent_at < now() - interval '60 seconds'
         RETURNING phone`, [phone, purpose, hash]
    );
    if (!reserved.rowCount) return res.status(429).json({ error: "请等待 60 秒后再获取验证码" });
    await pool.query("INSERT INTO sms_send_events(phone,requester_ip) VALUES($1,$2::inet)", [phone, ip]);
    try {
        const result = await deliverSms(phone, code);
        res.json({ ok: true, message: "验证码已发送，5 分钟内有效", ...result });
    } catch (error) {
        await pool.query("DELETE FROM sms_verifications WHERE phone=$1 AND purpose=$2 AND code_hash=$3", [phone, purpose, hash]);
        console.error("[sms] send failed:", error.message);
        res.status(502).json({ error: "验证码发送失败，请稍后再试" });
    }
}

export async function consumeVerification(client, phone, purpose, code) {
    if (!/^\d{6}$/.test(String(code || ""))) return false;
    const result = await client.query(
        `DELETE FROM sms_verifications WHERE phone=$1 AND purpose=$2 AND code_hash=$3
         AND expires_at > now() AND attempts < 5 RETURNING phone`,
        [phone, purpose, codeHash(phone, purpose, code)]
    );
    if (result.rowCount) return true;
    await client.query(
        `UPDATE sms_verifications SET attempts=attempts+1 WHERE phone=$1 AND purpose=$2
         AND expires_at > now() AND attempts < 5`, [phone, purpose]
    );
    return false;
}
