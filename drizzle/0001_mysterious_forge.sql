ALTER TYPE "public"."attempt_source" ADD VALUE 'review';--> statement-breakpoint
CREATE TABLE "srs_states" (
	"student_id" text NOT NULL,
	"problem_id" text NOT NULL,
	"box" integer DEFAULT 1 NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"last_reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"next_review_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "srs_states_student_id_problem_id_pk" PRIMARY KEY("student_id","problem_id")
);
--> statement-breakpoint
ALTER TABLE "srs_states" ADD CONSTRAINT "srs_states_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "srs_states" ADD CONSTRAINT "srs_states_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;