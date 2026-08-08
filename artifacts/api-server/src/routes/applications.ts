import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, jobApplicationsTable, jobsTable, usersTable, insertJobApplicationSchema } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { toPublicUser } from "../lib/public-user";

const router: IRouter = Router();
router.use(requireAuth);

router.post("/jobs/:jobId/applications", async (req, res) => {
  const jobId = req.params.jobId;
  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId)).limit(1);
  if (!job || job.status !== "open") { res.status(404).json({ error: "الوظيفة غير متاحة" }); return; }
  if (job.employerId === req.user!.id) { res.status(400).json({ error: "لا يمكنك التقديم على وظيفتك" }); return; }
  const parsed = insertJobApplicationSchema.safeParse({ ...req.body, jobId });
  if (!parsed.success) { res.status(400).json({ error: "بيانات الطلب غير صالحة" }); return; }
  try {
    const [application] = await db.insert(jobApplicationsTable).values({ ...parsed.data, applicantId: req.user!.id }).returning();
    res.status(201).json({ application });
  } catch (error: any) {
    if (error?.code === "23505") { res.status(409).json({ error: "لقد تقدمت لهذه الوظيفة من قبل" }); return; }
    throw error;
  }
});

router.get("/jobs/:jobId/applications", async (req, res) => {
  const [job] = await db.select({ employerId: jobsTable.employerId }).from(jobsTable).where(eq(jobsTable.id, req.params.jobId)).limit(1);
  if (!job || job.employerId !== req.user!.id) { res.status(403).json({ error: "غير مصرح" }); return; }
  const rows = await db.select({ application: jobApplicationsTable, applicant: usersTable })
    .from(jobApplicationsTable)
    .innerJoin(usersTable, eq(jobApplicationsTable.applicantId, usersTable.id))
    .where(eq(jobApplicationsTable.jobId, req.params.jobId))
    .orderBy(desc(jobApplicationsTable.createdAt));
  res.json({ applications: rows.map(r => ({ ...r.application, applicant: toPublicUser(r.applicant) })) });
});

router.patch("/applications/:id", async (req, res) => {
  const status = req.body?.status;
  if (!["pending", "accepted", "rejected"].includes(status)) { res.status(400).json({ error: "حالة الطلب غير صالحة" }); return; }
  const [row] = await db.select({ application: jobApplicationsTable, employerId: jobsTable.employerId })
    .from(jobApplicationsTable)
    .innerJoin(jobsTable, eq(jobApplicationsTable.jobId, jobsTable.id))
    .where(eq(jobApplicationsTable.id, req.params.id)).limit(1);
  if (!row || row.employerId !== req.user!.id) { res.status(403).json({ error: "غير مصرح" }); return; }
  const [application] = await db.update(jobApplicationsTable).set({ status }).where(eq(jobApplicationsTable.id, req.params.id)).returning();
  res.json({ application });
});

router.get("/applications/me", async (req, res) => {
  const rows = await db.select({ application: jobApplicationsTable, job: jobsTable })
    .from(jobApplicationsTable)
    .innerJoin(jobsTable, eq(jobApplicationsTable.jobId, jobsTable.id))
    .where(eq(jobApplicationsTable.applicantId, req.user!.id))
    .orderBy(desc(jobApplicationsTable.createdAt));
  res.json({ applications: rows.map(r => ({ ...r.application, job: r.job })) });
});

export default router;
