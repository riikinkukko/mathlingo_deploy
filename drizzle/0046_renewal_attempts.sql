ALTER TABLE "users" ADD COLUMN "renewal_failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "renewal_failed_at" timestamp with time zone;