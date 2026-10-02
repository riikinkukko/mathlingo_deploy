ALTER TYPE "public"."notification_type" ADD VALUE 'weekly_report';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tg_weekly_report" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "weekly_report_sent_on" text;