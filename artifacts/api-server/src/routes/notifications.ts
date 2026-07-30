import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.use(requireAuth);

// GET /api/notifications?type=&unreadOnly=
router.get("/notifications", async (req, res) => {
  const { type } = req.query as { type?: string };
  const unreadOnly = req.query.unreadOnly === "true";

  const conditions = [eq(notificationsTable.userId, req.user!.id)];
  if (type) {
    conditions.push(
      eq(
        notificationsTable.type,
        type as
          | "job"
          | "worker"
          | "application_accepted"
          | "application_rejected"
          | "message"
          | "call"
          | "ai"
          | "system",
      ),
    );
  }
  if (unreadOnly) conditions.push(eq(notificationsTable.read, false));

  const rows = await db
    .select()
    .from(notificationsTable)
    .where(and(...conditions))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);

  res.json({ notifications: rows });
});

router.post("/notifications/:id/read", async (req, res) => {
  await db
    .update(notificationsTable)
    .set({ read: true })
    .where(
      and(
        eq(notificationsTable.id, req.params.id),
        eq(notificationsTable.userId, req.user!.id),
      ),
    );

  res.status(204).end();
});

router.post("/notifications/read-all", async (req, res) => {
  await db
    .update(notificationsTable)
    .set({ read: true })
    .where(eq(notificationsTable.userId, req.user!.id));

  res.status(204).end();
});

export default router;
