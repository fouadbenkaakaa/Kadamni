import { Router, type IRouter } from "express";
import { eq, or } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
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

router.post("/auth/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات غير صالحة" });
    return;
  }
  const { fullName, email, phone, password, accountType, city } =
    parsed.data;

  if (!email && !phone) {
    res.status(400).json({ error: "يجب إدخال بريد إلكتروني أو رقم هاتف" });
    return;
  }

  const lookupConditions = [
    email ? eq(usersTable.email, email) : null,
    phone ? eq(usersTable.phone, phone) : null,
  ].filter((c) => c !== null);

  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(or(...lookupConditions))
    .limit(1);

  if (existing.length > 0) {
    res
      .status(409)
      .json({ error: "البريد الإلكتروني أو رقم الهاتف مسجّل مسبقاً" });
    return;
  }

  const [user] = await db
    .insert(usersTable)
    .values({
      fullName,
      email: email ?? null,
      phone: phone ?? null,
      passwordHash: hashPassword(password),
      accountType,
      city: city ?? null,
    })
    .returning();

  const { token, expiresAt } = await createSession(
    user.id,
    req.headers["user-agent"],
  );
  setSessionCookie(res, token, expiresAt);

  res.status(201).json({ user: toPublicUser(user) });
});

router.post("/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات غير صالحة" });
    return;
  }
  const { identifier, password } = parsed.data;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(
      or(eq(usersTable.email, identifier), eq(usersTable.phone, identifier)),
    )
    .limit(1);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
    return;
  }

  const { token, expiresAt } = await createSession(
    user.id,
    req.headers["user-agent"],
  );
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
