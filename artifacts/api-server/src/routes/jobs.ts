import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, jobsTable, usersTable, insertJobSchema } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { toPublicUser } from "../lib/public-user";

const router: IRouter = Router();

router.get("/jobs", async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const jobs = await db.select({ job: jobsTable, employer: usersTable }).from(jobsTable)
    .innerJoin(usersTable, eq(jobsTable.employerId, usersTable.id)).where(eq(jobsTable.status, "open"))
    .orderBy(desc(jobsTable.createdAt)).limit(limit);
  res.json({ jobs: jobs.map(r => ({ ...r.job, employer: toPublicUser(r.employer) })) });
});

router.get("/jobs/:id", async (req, res) => {
  const id = String(req.params.id);
  const [row] = await db.select({ job: jobsTable, employer: usersTable }).from(jobsTable)
    .innerJoin(usersTable, eq(jobsTable.employerId, usersTable.id)).where(eq(jobsTable.id, id)).limit(1);
  if (!row) { res.status(404).json({ error: "الوظيفة غير موجودة" }); return; }
  res.json({ job: { ...row.job, employer: toPublicUser(row.employer) } });
});

router.post("/jobs", requireAuth, async (req, res) => {
  const parsed = insertJobSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "بيانات غير صالحة" }); return; }
  const [job] = await db.insert(jobsTable).values({ ...parsed.data, employerId: req.user!.id }).returning();
  res.status(201).json({ job });
});

router.patch("/jobs/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const [existing] = await db.select({ employerId: jobsTable.employerId }).from(jobsTable).where(eq(jobsTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "الوظيفة غير موجودة" }); return; }
  if (existing.employerId !== req.user!.id) { res.status(403).json({ error: "لا يمكنك تعديل هذا الإعلان" }); return; }
  const parsed = insertJobSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "بيانات غير صالحة" }); return; }
  const [job] = await db.update(jobsTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(jobsTable.id, id)).returning();
  res.json({ job });
});

router.delete("/jobs/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const [existing] = await db.select({ employerId: jobsTable.employerId }).from(jobsTable).where(eq(jobsTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "الوظيفة غير موجودة" }); return; }
  if (existing.employerId !== req.user!.id) { res.status(403).json({ error: "لا يمكنك حذف هذا الإعلان" }); return; }
  await db.delete(jobsTable).where(eq(jobsTable.id, id));
  res.status(204).end();
});

export default router;
