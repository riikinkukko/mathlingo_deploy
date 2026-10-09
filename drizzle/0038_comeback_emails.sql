ALTER TABLE "users" ADD COLUMN "email_reminders" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "comeback_stage" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "comeback_sent_at" timestamp with time zone;