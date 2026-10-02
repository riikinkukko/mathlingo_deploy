ALTER TYPE "public"."notification_type" ADD VALUE 'question_answered' BEFORE 'review_decided';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'question_asked' BEFORE 'review_decided';--> statement-breakpoint
CREATE TABLE "student_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"teacher_id" text NOT NULL,
	"problem_id" text NOT NULL,
	"student_answer" text,
	"message" text DEFAULT '' NOT NULL,
	"answer" text,
	"answered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "student_questions" ADD CONSTRAINT "student_questions_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_questions" ADD CONSTRAINT "student_questions_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_questions" ADD CONSTRAINT "student_questions_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;