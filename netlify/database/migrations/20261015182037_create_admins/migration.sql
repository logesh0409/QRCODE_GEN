CREATE TABLE "admins" (
	"id" integer PRIMARY KEY DEFAULT 1,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "admins_single_row" CHECK ("id" = 1)
);
