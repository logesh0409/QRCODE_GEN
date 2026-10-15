import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const certificates = pgTable("certificates", {
  id: text().primaryKey(),
  title: text().notNull(),
  // Key of the uploaded file in the "certificates" blob store
  file: text().notNull(),
  contentType: text("content_type").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
