import { pgTable, uuid, text, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { jobsTable } from "./jobs";

export const ratingsTable = pgTable(
  "ratings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // The person being rated (worker or employer).
    targetUserId: uuid("target_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    // The person giving the rating.
    raterUserId: uuid("rater_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    // Optional: which job this rating is tied to.
    jobId: uuid("job_id").references(() => jobsTable.id, {
      onDelete: "set null",
    }),
    value: integer("value").notNull(), // 1-5
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  // One rating per (rater, target, job) — prevents duplicate spam ratings.
  (t) => [unique().on(t.raterUserId, t.targetUserId, t.jobId)],
);

export const insertRatingSchema = createInsertSchema(ratingsTable)
  .omit({ id: true, raterUserId: true, createdAt: true })
  .extend({ value: z.number().int().min(1).max(5) });

export type InsertRating = z.infer<typeof insertRatingSchema>;
export type Rating = typeof ratingsTable.$inferSelect;
