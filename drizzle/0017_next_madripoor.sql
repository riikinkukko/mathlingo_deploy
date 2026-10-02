ALTER TYPE "public"."notification_type" ADD VALUE 'homework_completed' BEFORE 'lesson_log_added';--> statement-breakpoint
ALTER TABLE "scheduled_lessons" ADD COLUMN "teacher_prompted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tg_notify_homework" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tg_notify_lessons" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tg_daily_digest" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "digest_sent_on" text;