ALTER TABLE "scheduled_lessons" ADD COLUMN "series_id" text;--> statement-breakpoint
ALTER TABLE "scheduled_lessons" ADD COLUMN "reminded_at" timestamp with time zone;