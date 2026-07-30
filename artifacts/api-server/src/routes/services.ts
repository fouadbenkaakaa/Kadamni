import { Router, type IRouter } from "express";
import { and, desc, eq, ilike } from "drizzle-orm";
import {
  db,
  servicesTable,
  usersTable,
  insertServiceSchema,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { toPublicUser } from "../lib/public-user";

const router: IRouter = Router();

// GET /api/services?city=&limit=&offset=
router.get("/services", async (req, res) => {
  const { city } = req.query as { city?: string };
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const offset = Number(req.query.offset) || 0;

  const conditions = city ? [ilike(servicesTable.city, `%${city}%`)] : [];

  const rows = await db
    .select({ service: servicesTable, worker: usersTable })
    .from(servicesTable)
    .innerJoin(usersTable, eq(servicesTable.workerId, usersTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(servicesTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({
    services: rows.map((r) => ({
      ...r.service,
      worker: toPublicUser(r.worker),
    })),
  });
});

router.get("/services/:id", async (req, res) => {
  const [row] = await db
    .select({ service: servicesTable, worker: usersTable })
    .from(servicesTable)
    .innerJoin(usersTable, eq(servicesTable.workerId, usersTable.id))
    .where(eq(servicesTable.id, req.params.id))
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "الخدمة غير موجودة" });
    return;
  }

  res.json({
    service: { ...row.service, worker: toPublicUser(row.worker) },
  });
});

router.post("/services", requireAuth, async (req, res) => {
  if (req.user!.accountType !== "worker") {
    res.status(403).json({ error: "نشر الخدمات متاح للعمال المهنيين فقط" });
    return;
  }

  const parsed = insertServiceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات غير صالحة" });
    return;
  }

  const [service] = await db
    .insert(servicesTable)
    .values({ ...parsed.data, workerId: req.user!.id })
    .returning();

  res.status(201).json({ service });
});

export default router;
