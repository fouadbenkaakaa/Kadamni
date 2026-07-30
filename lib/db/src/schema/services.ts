import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  numeric,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// A service posted by a freelance/professional worker (as opposed to a job
// posting created by an employer looking to hire).
export const servicesTable = pgTable("services", {
  id: uuid("id").primaryKey().defaultRandom(),
  workerId: uuid("worker_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),

  name: text("name").notNull(),
  description: text("description").notNull(),
  price: numeric("price", { precision: 12, scale: 2 }),
  durationEstimate: text("duration_estimate"),

  city: text("city").notNull(),
  locationLat: numeric("location_lat", { precision: 10, scale: 6 }),
  locationLng: numeric("location_lng", { precision: 10, scale: 6 }),

  canTravelToClient: boolean("can_travel_to_client").notNull().default(true),
  availableNow: boolean("available_now").notNull().default(true),

  portfolioImages: text("portfolio_images").array(),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertServiceSchema = createInsertSchema(servicesTable).omit({
  id: true,
  workerId: true,
  createdAt: true,
  updatedAt: true,
});
export const selectServiceSchema = createSelectSchema(servicesTable);

export type InsertService = z.infer<typeof insertServiceSchema>;
export type Service = typeof servicesTable.$inferSelect;
