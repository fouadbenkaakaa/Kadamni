import { Router, type IRouter } from "express";
import { and, count, desc, eq, ne, or } from "drizzle-orm";
import { db, jobsTable, servicesTable, favoritesTable, ratingsTable, jobApplicationsTable, messagesTable, conversationsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();
router.use(requireAuth);

router.get("/activity", async (req, res) => {
  const me = req.user!.id;
  const [jobsPosted] = await db.select({ value: count() }).from(jobsTable).where(eq(jobsTable.employerId, me));
  const [servicesPosted] = await db.select({ value: count() }).from(servicesTable).where(eq(servicesTable.workerId, me));
  const [favorites] = await db.select({ value: count() }).from(favoritesTable).where(eq(favoritesTable.userId, me));
  const [ratingsGiven] = await db.select({ value: count() }).from(ratingsTable).where(eq(ratingsTable.raterUserId, me));
  const [ratingsReceived] = await db.select({ value: count() }).from(ratingsTable).where(eq(ratingsTable.targetUserId, me));
  const [applicationsSent] = await db.select({ value: count() }).from(jobApplicationsTable).where(eq(jobApplicationsTable.applicantId, me));
  const [messagesSent] = await db.select({ value: count() }).from(messagesTable).where(eq(messagesTable.senderId, me));
  const [messagesReceived] = await db.select({ value: count() }).from(messagesTable)
    .innerJoin(conversationsTable, eq(messagesTable.conversationId, conversationsTable.id))
    .where(and(or(eq(conversationsTable.participantOneId, me), eq(conversationsTable.participantTwoId, me)), ne(messagesTable.senderId, me)));

  const recentJobs = await db.select().from(jobsTable).where(eq(jobsTable.employerId, me)).orderBy(desc(jobsTable.createdAt)).limit(10);
  const recentServices = await db.select().from(servicesTable).where(eq(servicesTable.workerId, me)).orderBy(desc(servicesTable.createdAt)).limit(10);

  res.json({
    stats: {
      jobsPosted: Number(jobsPosted?.value || 0),
      servicesPosted: Number(servicesPosted?.value || 0),
      favorites: Number(favorites?.value || 0),
      ratingsGiven: Number(ratingsGiven?.value || 0),
      ratingsReceived: Number(ratingsReceived?.value || 0),
      applicationsSent: Number(applicationsSent?.value || 0),
      messagesSent: Number(messagesSent?.value || 0),
      messagesReceived: Number(messagesReceived?.[0]?.value || 0),
    },
    recentJobs,
    recentServices,
  });
});

export default router;
