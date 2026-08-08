import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, usersTable, jobsTable } from "@workspace/db";
import { toPublicUser } from "../lib/public-user";

const router: IRouter = Router();
const distanceKm = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const R = 6371;
  const dLat = (bLat - aLat) * Math.PI / 180;
  const dLng = (bLng - aLng) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

router.get("/nearby", async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const radius = Math.min(Math.max(Number(req.query.radius) || 25, 1), 200);
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    res.status(400).json({ error: "إحداثيات الموقع غير صالحة" });
    return;
  }

  const workers = await db.select().from(usersTable).where(eq(usersTable.accountType, "worker")).orderBy(desc(usersTable.availableNow)).limit(500);
  const jobs = await db.select().from(jobsTable).where(eq(jobsTable.status, "open")).orderBy(desc(jobsTable.createdAt)).limit(500);

  const nearbyWorkers = workers.filter(w => w.locationLat != null && w.locationLng != null).map(w => ({
    ...toPublicUser(w),
    distanceKm: distanceKm(lat, lng, Number(w.locationLat), Number(w.locationLng)),
  })).filter(w => w.distanceKm <= radius).sort((a, b) => a.distanceKm - b.distanceKm).slice(0, limit);

  const nearbyJobs = jobs.filter(j => j.locationLat != null && j.locationLng != null).map(j => ({
    ...j,
    distanceKm: distanceKm(lat, lng, Number(j.locationLat), Number(j.locationLng)),
  })).filter(j => j.distanceKm <= radius).sort((a, b) => a.distanceKm - b.distanceKm).slice(0, limit);

  res.json({ workers: nearbyWorkers, jobs: nearbyJobs, center: { lat, lng }, radiusKm: radius });
});

export default router;
