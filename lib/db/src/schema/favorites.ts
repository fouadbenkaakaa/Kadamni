import { pgTable, uuid, timestamp, pgEnum, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const favoriteTargetTypeEnum = pgEnum("favorite_target_type", [
  "worker",
  "job",
  "service",
]);

export const favoritesTable = pgTable(
  "favorites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    targetType: favoriteTargetTypeEnum("target_type").notNull(),
    // References jobs.id, services.id, or users.id depending on targetType.
    // Not a strict FK since it points to different tables.
    targetId: uuid("target_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique().on(t.userId, t.targetType, t.targetId)],
);

export const insertFavoriteSchema = createInsertSchema(favoritesTable).omit({
  id: true,
  userId: true,
  createdAt: true,
});
export type InsertFavorite = z.infer<typeof insertFavoriteSchema>;
export type Favorite = typeof favoritesTable.$inferSelect;
