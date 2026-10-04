ALTER TYPE "public"."lesson_status" ADD VALUE 'missed';--> statement-breakpoint
ALTER TABLE "scheduled_lessons" ADD COLUMN "price_rub" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "lesson_price_rub" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "group_lesson_price_rub" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "charge_missed" boolean DEFAULT false NOT NULL;