import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { toPublicUser } from "../lib/public-user";

const router: IRouter = Router();

// Deliberately separate from insertUserSchema: this endpoint must never accept
// password, account type, verification flags, ratings, IDs, or other sensitive fields.
const updateMyProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  city: z.string().trim().max(120).optional(),
  profession: z.string().trim().max(120).optional(),
  bio: z.string().trim().max(2000).optional(),
  experienceYears: z.number().int().min(0).max(80).optional(),
  skills: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  languages: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  avatarUrl: z.string().trim().max(1500000).refine(
    (value) => value === "" || /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value),
    "صيغة الصورة غير صالحة",
  ).optional(),
}).strict();

router.patch("/users/me", requireAuth, async (req, res) => {
  const parsed = updateMyProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات الملف الشخصي غير صالحة" });
    return;
  }

  const data = parsed.data;
  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: "لم يتم إرسال أي تعديل" });
    return;
  }

  const [user] = await db
    .update(usersTable)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(usersTable.id, req.user!.id))
    .returning();

  if (!user) {
    res.status(404).json({ error: "المستخدم غير موجود" });
    return;
  }

  res.json({ user: toPublicUser(user) });
});

export default router;
