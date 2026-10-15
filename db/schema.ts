import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const certificates = pgTable("certificates", {
  id: text().primaryKey(),
  title: text().notNull(),
  // Key of the uploaded file in the "certificates" blob store
  file: text().notNull(),
  contentType: text("content_type").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// The single admin account created on the first-time setup page (id is always 1, so only one can exist)
export const admins = pgTable("admins", {
  id: integer().primaryKey().default(1),
  username: text().notNull(),
  // scrypt hash, stored as "salt:hash" in hex
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [check("admins_single_row", sql`${t.id} = 1`)]);
