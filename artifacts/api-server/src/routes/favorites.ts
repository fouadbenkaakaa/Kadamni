import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  favoritesTable,
  jobsTable,
  servicesTable,
  usersTable,
  insertFavoriteSchema,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { toPublicUser } from "../lib/public-user";

const router: IRouter = Router();

router.use(requireAuth);

// GET /api/favorites — returns the current user's saved workers/jobs/services,
// each expanded with the actual target record.
router.get("/favorites", async (req, res) => {
  const favorites = await db
    .select()
    .from(favoritesTable)
    .where(eq(favoritesTable.userId, req.user!.id));

  const expanded = await Promise.all(
    favorites.map(async (fav) => {
      if (fav.targetType === "worker") {
        const [worker] = await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.id, fav.targetId))
          .limit(1);
        return { ...fav, target: worker ? toPublicUser(worker) : null };
      }
      if (fav.targetType === "job") {
        const [job] = await db
          .select()
          .from(jobsTable)
          .where(eq(jobsTable.id, fav.targetId))
          .limit(1);
        return { ...fav, target: job ?? null };
      }
      const [service] = await db
        .select()
        .from(servicesTable)
        .where(eq(servicesTable.id, fav.targetId))
        .limit(1);
      return { ...fav, target: service ?? null };
    }),
  );

  res.json({ favorites: expanded });
});

router.post("/favorites", async (req, res) => {
  const parsed = insertFavoriteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات غير صالحة" });
    return;
  }

  const [favorite] = await db
    .insert(favoritesTable)
    .values({ ...parsed.data, userId: req.user!.id })
    .onConflictDoNothing()
    .returning();

  res.status(201).json({ favorite: favorite ?? null });
});

router.delete("/favorites/:id", async (req, res) => {
  await db
    .delete(favoritesTable)
    .where(
      and(
        eq(favoritesTable.id, req.params.id),
        eq(favoritesTable.userId, req.user!.id),
      ),
    );

  res.status(204).end();
});

export default router;
