import { Router, type IRouter } from "express";
import { and, desc, eq, gte, ilike } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { toPublicUser } from "../lib/public-user";

const router: IRouter = Router();

// GET /api/workers?city=&profession=&availableNow=&minRating=&limit=&offset=
router.get("/workers", async (req, res) => {
  const { city, profession } = req.query as {
    city?: string;
    profession?: string;
  };
  const availableNow = req.query.availableNow as string | undefined;
  const minRating = req.query.minRating as string | undefined;
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const offset = Number(req.query.offset) || 0;

  const conditions = [eq(usersTable.accountType, "worker")];
  if (city) conditions.push(ilike(usersTable.city, `%${city}%`));
  if (profession) conditions.push(ilike(usersTable.profession, `%${profession}%`));
  if (availableNow === "true") conditions.push(eq(usersTable.availableNow, true));
  if (minRating) conditions.push(gte(usersTable.ratingAverage, minRating));

  const rows = await db
    .select()
    .from(usersTable)
    .where(and(...conditions))
    .orderBy(desc(usersTable.availableNow), desc(usersTable.ratingAverage))
    .limit(limit)
    .offset(offset);

  res.json({ workers: rows.map(toPublicUser) });
});

router.get("/workers/:id", async (req, res) => {
  const [worker] = await db
    .select()
    .from(usersTable)
    .where(
      and(eq(usersTable.id, req.params.id), eq(usersTable.accountType, "worker")),
    )
    .limit(1);

  if (!worker) {
    res.status(404).json({ error: "العامل غير موجود" });
    return;
  }

  res.json({ worker: toPublicUser(worker) });
});

export default router;
