import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  pgEnum,
  numeric,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const conversationsTable = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  participantOneId: uuid("participant_one_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  participantTwoId: uuid("participant_two_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const messageTypeEnum = pgEnum("message_type", [
  "text",
  "image",
  "file",
  "location",
  "voice",
]);

export const messagesTable = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversationsTable.id, { onDelete: "cascade" }),
  senderId: uuid("sender_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  type: messageTypeEnum("type").notNull().default("text"),
  content: text("content").notNull(), // text body, file URL, or "lat,lng" for location
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertMessageSchema = createInsertSchema(messagesTable).omit({
  id: true,
  senderId: true,
  read: true,
  createdAt: true,
});
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messagesTable.$inferSelect;
export type Conversation = typeof conversationsTable.$inferSelect;

// Voice/video call log — used to render call history and duration.
export const callsTable = pgTable("calls", {
  id: uuid("id").primaryKey().defaultRandom(),
  callerId: uuid("caller_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  calleeId: uuid("callee_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  durationSeconds: numeric("duration_seconds", { precision: 8, scale: 0 }),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

export type Call = typeof callsTable.$inferSelect;
