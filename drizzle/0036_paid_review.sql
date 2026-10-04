CREATE TABLE "review_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"attempt_id" text NOT NULL,
	"student_id" text NOT NULL,
	"status" text NOT NULL,
	"price_rub" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	CONSTRAINT "review_orders_attempt_id_unique" UNIQUE("attempt_id")
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "review_order_id" text;--> statement-breakpoint
ALTER TABLE "review_orders" ADD CONSTRAINT "review_orders_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_orders" ADD CONSTRAINT "review_orders_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;