import { Router, type IRouter } from "express";
import { createHash, randomInt } from "node:crypto";
import { eq, or } from "drizzle-orm";
import { db, pool, usersTable } from "@workspace/db";
import { registerSchema, loginSchema } from "../schemas/auth";
import { hashPassword, verifyPassword } from "../lib/password";
import {
  createSession,
  setSessionCookie,
  clearSessionCookie,
  destroySession,
  SESSION_COOKIE,
} from "../lib/session";
import { toPublicUser } from "../lib/public-user";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

let otpTableReady = false;
async function ensureOtpTable() {
  if (otpTableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS registration_otps (
      phone TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT,
      password_hash TEXT NOT NULL,
      account_type TEXT NOT NULL CHECK (account_type IN ('seeker','employer','worker')),
      city TEXT,
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  otpTableReady = true;
}

function normalizePhone(input: string) {
  let phone = String(input || "").trim().replace(/[\s().-]/g, "");
  if (phone.startsWith("00")) phone = "+" + phone.slice(2);
  if (phone.startsWith("0") && phone.length === 10) phone = "+213" + phone.slice(1);
  else if (phone.startsWith("213") && phone.length === 12) phone = "+" + phone;
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) return null;
  return phone;
}

function hashOtp(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

async function sendInfobipOtp(phone: string, code: string) {
  const apiKey = process.env.INFOBIP_API_KEY;
  const baseUrl = (process.env.INFOBIP_BASE_URL || "").replace(/\/$/, "");
  const sender = process.env.INFOBIP_SENDER || "ServiceSMS";
  if (!apiKey || !baseUrl) {
    throw new Error("خدمة التحقق عبر SMS غير مهيأة على الخادم");
  }

  const response = await fetch(`https://${baseUrl}/sms/2/text/advanced`, {
    method: "POST",
    headers: {
      Authorization: `App ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      messages: [{
        destinations: [{ to: phone }],
        from: sender,
        text: `رمز التحقق الخاص بك في خدمني هو: ${code}. صالح لمدة 5 دقائق.`,
      }],
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    console.error("Infobip SMS error", response.status, data);
    throw new Error("تعذر إرسال رمز التحقق عبر SMS");
  }
  return data;
}

async function sendRegistrationOtp(req: any, res: any) {
  await ensureOtpTable();

  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات التسجيل غير صالحة" });
    return;
  }

  const { fullName, email, phone: rawPhone, password, accountType, city } = parsed.data;
  if (!rawPhone) {
    res.status(400).json({ error: "رقم الهاتف مطلوب لتأكيد الحساب" });
    return;
  }

  const phone = normalizePhone(rawPhone);
  if (!phone) {
    res.status(400).json({ error: "رقم الهاتف غير صالح. استخدم رقمًا دوليًا مثل +213XXXXXXXXX" });
    return;
  }

  const lookupConditions = [
    eq(usersTable.phone, phone),
    email ? eq(usersTable.email, email) : null,
  ].filter((c) => c !== null);

  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(or(...lookupConditions))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "رقم الهاتف أو البريد الإلكتروني مسجّل مسبقاً" });
    return;
  }

  const previous = await pool.query(
    "SELECT last_sent_at FROM registration_otps WHERE phone = $1",
    [phone],
  );
  if (previous.rows[0]) {
    const elapsed = Date.now() - new Date(previous.rows[0].last_sent_at).getTime();
    if (elapsed < 60_000) {
      res.status(429).json({ error: `انتظر ${Math.ceil((60_000 - elapsed) / 1000)} ثانية قبل طلب رمز جديد` });
      return;
    }
  }

  const code = String(randomInt(100000, 1000000));
  await sendInfobipOtp(phone, code);

  await pool.query(
    `INSERT INTO registration_otps
      (phone, full_name, email, password_hash, account_type, city, code_hash, expires_at, attempts, last_sent_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW() + INTERVAL '5 minutes',0,NOW())
     ON CONFLICT (phone) DO UPDATE SET
       full_name = EXCLUDED.full_name,
       email = EXCLUDED.email,
       password_hash = EXCLUDED.password_hash,
       account_type = EXCLUDED.account_type,
       city = EXCLUDED.city,
       code_hash = EXCLUDED.code_hash,
       expires_at = EXCLUDED.expires_at,
       attempts = 0,
       last_sent_at = NOW()`,
    [phone, fullName, email ?? null, hashPassword(password), accountType, city ?? null, hashOtp(code)],
  );

  res.json({ ok: true, phone, expiresIn: 300 });
}

router.post("/auth/register/request-otp", async (req, res) => {
  try {
    await sendRegistrationOtp(req, res);
  } catch (error) {
    console.error("Registration OTP error", error);
    if (!res.headersSent) res.status(502).json({ error: error instanceof Error ? error.message : "تعذر إرسال رمز التحقق" });
  }
});

router.post("/auth/register/verify-otp", async (req, res) => {
  try {
    await ensureOtpTable();
    const rawPhone = String(req.body?.phone || "");
    const code = String(req.body?.code || "").replace(/\D/g, "");
    const phone = normalizePhone(rawPhone);

    if (!phone || !/^\d{6}$/.test(code)) {
      res.status(400).json({ error: "رقم الهاتف أو رمز التحقق غير صالح" });
      return;
    }

    const result = await pool.query(
      `SELECT phone, full_name, email, password_hash, account_type, city, code_hash, expires_at, attempts
       FROM registration_otps WHERE phone = $1 LIMIT 1`,
      [phone],
    );
    const pending = result.rows[0];

    if (!pending) {
      res.status(400).json({ error: "لا يوجد طلب تحقق لهذا الرقم" });
      return;
    }
    if (new Date(pending.expires_at).getTime() < Date.now()) {
      await pool.query("DELETE FROM registration_otps WHERE phone = $1", [phone]);
      res.status(400).json({ error: "انتهت صلاحية الرمز. اطلب رمزًا جديدًا" });
      return;
    }
    if (pending.attempts >= 5) {
      res.status(429).json({ error: "تم تجاوز عدد المحاولات. اطلب رمزًا جديدًا" });
      return;
    }

    if (hashOtp(code) !== pending.code_hash) {
      await pool.query("UPDATE registration_otps SET attempts = attempts + 1 WHERE phone = $1", [phone]);
      res.status(400).json({ error: "رمز التحقق غير صحيح" });
      return;
    }

    const duplicate = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        or(
          eq(usersTable.phone, phone),
          pending.email ? eq(usersTable.email, pending.email) : eq(usersTable.phone, phone),
        ),
      )
      .limit(1);
    if (duplicate.length > 0) {
      await pool.query("DELETE FROM registration_otps WHERE phone = $1", [phone]);
      res.status(409).json({ error: "رقم الهاتف أو البريد الإلكتروني مسجّل مسبقاً" });
      return;
    }

    const [user] = await db
      .insert(usersTable)
      .values({
        fullName: pending.full_name,
        email: pending.email,
        phone,
        passwordHash: pending.password_hash,
        accountType: pending.account_type,
        city: pending.city,
        phoneVerified: true,
      })
      .returning();

    await pool.query("DELETE FROM registration_otps WHERE phone = $1", [phone]);

    const { token, expiresAt } = await createSession(user.id, req.headers["user-agent"]);
    setSessionCookie(res, token, expiresAt);
    res.status(201).json({ user: toPublicUser(user) });
  } catch (error) {
    console.error("Registration OTP verification error", error);
    if (!res.headersSent) res.status(500).json({ error: "تعذر تأكيد الحساب" });
  }
});

router.post("/auth/register", async (_req, res) => {
  res.status(410).json({ error: "يجب تأكيد رقم الهاتف برمز SMS قبل إنشاء الحساب" });
});

router.post("/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات غير صالحة" });
    return;
  }
  const { identifier, password } = parsed.data;
  const normalizedIdentifier = normalizePhone(identifier) || identifier;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(
      or(eq(usersTable.email, normalizedIdentifier), eq(usersTable.phone, normalizedIdentifier)),
    )
    .limit(1);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
    return;
  }
  if (user.phone && !user.phoneVerified) {
    res.status(403).json({ error: "يجب تأكيد رقم الهاتف أولاً" });
    return;
  }

  const { token, expiresAt } = await createSession(user.id, req.headers["user-agent"]);
  setSessionCookie(res, token, expiresAt);
  res.json({ user: toPublicUser(user) });
});

router.post("/auth/logout", async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  await destroySession(token);
  clearSessionCookie(res);
  res.status(204).end();
});

router.get("/auth/me", requireAuth, async (req, res) => {
  res.json({ user: toPublicUser(req.user!) });
});

export default router;
