import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  pgEnum,
  numeric,
  integer,
  date,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable, genderEnum } from "./users";

export const jobTypeEnum = pgEnum("job_type", [
  "full_time",
  "part_time",
  "freelance",
  "remote",
]);

export const jobStatusEnum = pgEnum("job_status", [
  "open",
  "closed",
  "filled",
]);

export const jobsTable = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  employerId: uuid("employer_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),

  title: text("title").notNull(),
  description: text("description").notNull(),
  salary: numeric("salary", { precision: 12, scale: 2 }),

  city: text("city").notNull(),
  locationLat: numeric("location_lat", { precision: 10, scale: 6 }),
  locationLng: numeric("location_lng", { precision: 10, scale: 6 }),

  workersNeeded: integer("workers_needed").notNull().default(1),
  experienceYears: integer("experience_years"),
  minAge: integer("min_age"),
  gender: genderEnum("gender"),

  jobType: jobTypeEnum("job_type").notNull().default("full_time"),
  workHours: text("work_hours"),
  contractDuration: text("contract_duration"),
  startDate: date("start_date"),

  images: text("images").array(),
  status: jobStatusEnum("status").notNull().default("open"),

  viewsCount: integer("views_count").notNull().default(0),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertJobSchema = createInsertSchema(jobsTable).omit({
  id: true,
  employerId: true,
  status: true,
  viewsCount: true,
  createdAt: true,
  updatedAt: true,
});
export const selectJobSchema = createSelectSchema(jobsTable);

export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobsTable.$inferSelect;

// A job seeker applying to a job posting.
export const applicationStatusEnum = pgEnum("application_status", [
  "pending",
  "accepted",
  "rejected",
]);

export const jobApplicationsTable = pgTable("job_applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobsTable.id, { onDelete: "cascade" }),
  applicantId: uuid("applicant_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  status: applicationStatusEnum("status").notNull().default("pending"),
  message: text("message"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertJobApplicationSchema = createInsertSchema(
  jobApplicationsTable,
).omit({ id: true, applicantId: true, status: true, createdAt: true });
export type InsertJobApplication = z.infer<typeof insertJobApplicationSchema>;
export type JobApplication = typeof jobApplicationsTable.$inferSelect;
