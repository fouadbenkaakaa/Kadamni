import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { db, jobsTable, usersTable, insertJobSchema } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { toPublicUser } from "../lib/public-user";

const router: IRouter = Router();

router.get("/jobs", async (req, res) => {
  const { city, jobType } = req.query as { city?: string; jobType?: string };
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const offset = Number(req.query.offset) || 0;
  const conditions = [eq(jobsTable.status, "open")];
  if (city) conditions.push(ilike(jobsTable.city, `%${city}%`));
  if (jobType) conditions.push(eq(jobsTable.jobType, jobType as "full_time" | "part_time" | "freelance" | "remote"));
  const rows = await db.select({ job: jobsTable, employer: usersTable }).from(jobsTable)
    .innerJoin(usersTable, eq(jobsTable.employerId, usersTable.id)).where(and(...conditions))
    .orderBy(desc(jobsTable.createdAt)).limit(limit).offset(offset);
  res.json({ jobs: rows.map(r => ({ ...r.job, employer: toPublicUser(r.employer) })) });
});

router.get("/jobs/:id", async (req, res) => {
  const rawId = req.params.id;
  const id: string = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id) {
    res.status(400).json({ error: "معرّف الوظيفة غير صالح" });
    return;
  }

  const [row] = await db.select({ job: jobsTable, employer: usersTable }).from(jobsTable)
    .innerJoin(usersTable, eq(jobsTable.employerId, usersTable.id))
    .where(eq(jobsTable.id, id)).limit(1);
  if (!row) { res.status(404).json({ error: "الوظيفة غير موجودة" }); return; }
  db.update(jobsTable).set({ viewsCount: sql`${jobsTable.viewsCount} + 1` }).where(eq(jobsTable.id, id)).catch(() => {});
  res.json({ job: { ...row.job, employer: toPublicUser(row.employer) } });
});

router.post("/jobs", requireAuth, async (req, res) => {
  if (req.user!.accountType !== "employer") { res.status(403).json({ error: "نشر الوظائف متاح لأصحاب العمل فقط" }); return; }
  const parsed = insertJobSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "بيانات غير صالحة" }); return; }
  const [job] = await db.insert(jobsTable).values({ ...parsed.data, employerId: req.user!.id }).returning();
  res.status(201).json({ job });
});

router.patch("/jobs/:id", requireAuth, async (req, res) => {
  const rawId = req.params.id;
  const id: string = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id) {
    res.status(400).json({ error: "معرّف الوظيفة غير صالح" });
    return;
  }

  const [existing] = await db.select({ employerId: jobsTable.employerId }).from(jobsTable)
    .where(eq(jobsTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "الوظيفة غير موجودة" }); return; }
  if (existing.employerId !== req.user!.id) { res.status(403).json({ error: "لا يمكنك تعديل هذا الإعلان" }); return; }
  const parsed = insertJobSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "بيانات غير صالحة" }); return; }
  const [job] = await db.update(jobsTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(jobsTable.id, id)).returning();
  res.json({ job });
});

export default router;
