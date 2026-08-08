import { Router, type IRouter } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { db, ratingsTable, usersTable, insertRatingSchema } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { toPublicUser } from "../lib/public-user";

const router: IRouter = Router();

router.get("/users/:userId/ratings", async (req, res) => {
  const userId = String(req.params.userId);
  const rows = await db.select({ rating: ratingsTable, rater: usersTable }).from(ratingsTable)
    .innerJoin(usersTable, eq(ratingsTable.raterUserId, usersTable.id)).where(eq(ratingsTable.targetUserId, userId))
    .orderBy(desc(ratingsTable.createdAt)).limit(100);
  res.json({ ratings: rows.map(r => ({ ...r.rating, rater: toPublicUser(r.rater) })) });
});

router.post("/users/:userId/ratings", requireAuth, async (req, res) => {
  const targetUserId = String(req.params.userId);
  if (targetUserId === req.user!.id) { res.status(400).json({ error: "لا يمكنك تقييم نفسك" }); return; }
  const [target] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, targetUserId)).limit(1);
  if (!target) { res.status(404).json({ error: "المستخدم غير موجود" }); return; }
  const parsed = insertRatingSchema.safeParse({ ...req.body, targetUserId });
  if (!parsed.success) { res.status(400).json({ error: "التقييم غير صالح" }); return; }
  try {
    const [rating] = await db.insert(ratingsTable).values({ ...parsed.data, raterUserId: req.user!.id }).returning();
    const [aggregate] = await db.select({ average: sql<string>`coalesce(avg(${ratingsTable.value}), 0)`, count: sql<number>`count(*)` })
      .from(ratingsTable).where(eq(ratingsTable.targetUserId, targetUserId));
    await db.update(usersTable).set({ ratingAverage: Number(aggregate?.average || 0).toFixed(2), ratingCount: Number(aggregate?.count || 0), updatedAt: new Date() })
      .where(eq(usersTable.id, targetUserId));
    res.status(201).json({ rating });
  } catch (error: any) {
    if (error?.code === "23505") { res.status(409).json({ error: "لقد أرسلت هذا التقييم من قبل" }); return; }
    throw error;
  }
});

export default router;
