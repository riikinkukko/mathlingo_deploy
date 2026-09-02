ALTER TABLE "payments" ADD COLUMN "payment_type" text DEFAULT 'student_pro' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "is_recurring_setup" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "teacher_plan" "plan" DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "teacher_pro_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_platform_owner" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "yookassa_payment_method_id" text;