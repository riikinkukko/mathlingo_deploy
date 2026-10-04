ALTER TABLE "payments" ADD COLUMN "tier" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "billing_period" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "teacher_tier" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "teacher_billing_period" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "teacher_trial_until" timestamp with time zone;--> statement-breakpoint
-- Подарок при запуске ступеней: всем бесплатным репетиторам (кроме владельца
-- платформы) — 14 дней «Профи» с момента миграции.
UPDATE "users" SET "teacher_trial_until" = now() + interval '14 days'
WHERE "role" = 'TEACHER' AND "teacher_plan" = 'free' AND NOT "is_platform_owner" AND "teacher_trial_until" IS NULL;
