import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  pgEnum,
  numeric,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

// A user can be a job seeker, an employer, or a freelance/professional worker.
// "worker" accounts get the extra profile fields below (profession, skills, etc).
export const accountTypeEnum = pgEnum("account_type", [
  "seeker",
  "employer",
  "worker",
]);

export const genderEnum = pgEnum("gender", ["male", "female"]);

export const usersTable = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),

  // Auth
  email: text("email").unique(),
  phone: text("phone").unique(),
  passwordHash: text("password_hash").notNull(),

  // Identity
  fullName: text("full_name").notNull(),
  accountType: accountTypeEnum("account_type").notNull().default("seeker"),
  avatarUrl: text("avatar_url"),
  coverUrl: text("cover_url"),
  age: integer("age"),
  gender: genderEnum("gender"),
  city: text("city"),
  locationLat: numeric("location_lat", { precision: 10, scale: 6 }),
  locationLng: numeric("location_lng", { precision: 10, scale: 6 }),

  // Worker/professional profile fields (nullable — only used when accountType = worker)
  profession: text("profession"),
  bio: text("bio"),
  experienceYears: integer("experience_years"),
  skills: text("skills").array(),
  languages: text("languages").array(),
  qualifications: text("qualifications"),
  hourlyOrJobPrice: text("price_range"),
  availableNow: boolean("available_now").notNull().default(false),

  // Trust & verification
  phoneVerified: boolean("phone_verified").notNull().default(false),
  emailVerified: boolean("email_verified").notNull().default(false),
  identityVerified: boolean("identity_verified").notNull().default(false),

  // Aggregates (denormalized for fast reads — recomputed by triggers/jobs)
  ratingAverage: numeric("rating_average", { precision: 3, scale: 2 })
    .notNull()
    .default("0"),
  ratingCount: integer("rating_count").notNull().default(0),
  completedJobsCount: integer("completed_jobs_count").notNull().default(0),

  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable)
  .omit({
    id: true,
    passwordHash: true,
    ratingAverage: true,
    ratingCount: true,
    completedJobsCount: true,
    phoneVerified: true,
    emailVerified: true,
    identityVerified: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    // Plain-text password accepted at the API boundary; hashed before insert.
    password: z.string().min(8),
  });

export const selectUserSchema = createSelectSchema(usersTable);

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

// Safe subset returned to clients — never leak passwordHash.
export const publicUserSchema = selectUserSchema.omit({ passwordHash: true });
export type PublicUser = z.infer<typeof publicUserSchema>;
