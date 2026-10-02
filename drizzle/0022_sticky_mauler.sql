ALTER TYPE "public"."notification_type" ADD VALUE 'streak_frozen' BEFORE 'weekly_report';--> statement-breakpoint
CREATE TABLE "streak_freeze_days" (
	"student_id" text NOT NULL,
	"day" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "streak_freeze_days_student_id_day_pk" PRIMARY KEY("student_id","day")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "streak_freezes" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "freeze_awarded_on" text;--> statement-breakpoint
ALTER TABLE "streak_freeze_days" ADD CONSTRAINT "streak_freeze_days_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;