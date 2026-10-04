ALTER TYPE "public"."notification_type" ADD VALUE 'plan_reminder';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "teacher_trial_reminded" text;