ALTER TYPE "public"."notification_type" ADD VALUE 'teacher_nudge' BEFORE 'weekly_report';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "nudged_at" timestamp with time zone;