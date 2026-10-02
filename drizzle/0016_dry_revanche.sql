ALTER TYPE "public"."notification_type" ADD VALUE 'payment_reminder' BEFORE 'review_decided';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "payment_reminders_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "payment_instructions" text;