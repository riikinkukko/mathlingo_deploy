CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"yookassa_payment_id" text NOT NULL,
	"amount_rub" integer NOT NULL,
	"status" text NOT NULL,
	"period_days" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	CONSTRAINT "payments_yookassa_payment_id_unique" UNIQUE("yookassa_payment_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pro_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;