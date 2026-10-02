ALTER TABLE "users" ADD COLUMN "tg_student_reminders" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "evening_reminded_on" text;