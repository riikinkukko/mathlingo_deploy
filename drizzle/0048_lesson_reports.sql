ALTER TABLE "lesson_logs" ADD COLUMN "lesson_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tg_report_lesson_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tg_report_asked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "report_reminded_on" text;--> statement-breakpoint
ALTER TABLE "lesson_logs" ADD CONSTRAINT "lesson_logs_lesson_id_scheduled_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."scheduled_lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lesson_logs_lesson_idx" ON "lesson_logs" USING btree ("lesson_id");