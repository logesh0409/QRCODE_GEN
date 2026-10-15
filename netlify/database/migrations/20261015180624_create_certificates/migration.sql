CREATE TABLE "certificates" (
	"id" text PRIMARY KEY,
	"title" text NOT NULL,
	"file" text NOT NULL,
	"content_type" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
