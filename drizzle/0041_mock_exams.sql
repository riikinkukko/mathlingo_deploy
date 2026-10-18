ALTER TYPE "public"."attempt_source" ADD VALUE 'mock';--> statement-breakpoint
CREATE TABLE "mock_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"variant" integer NOT NULL,
	"mode" text NOT NULL,
	"items" jsonb NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"time_spent" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"part1_correct" jsonb,
	"part2_attempts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"self_scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deadline_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"primary_score" integer,
	"test_score" integer,
	"part2_pending" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mock_images" (
	"mock_attempt_id" text NOT NULL,
	"problem_id" text NOT NULL,
	"data" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mock_images_mock_attempt_id_problem_id_pk" PRIMARY KEY("mock_attempt_id","problem_id")
);
--> statement-breakpoint
ALTER TABLE "mock_attempts" ADD CONSTRAINT "mock_attempts_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock_images" ADD CONSTRAINT "mock_images_mock_attempt_id_mock_attempts_id_fk" FOREIGN KEY ("mock_attempt_id") REFERENCES "public"."mock_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mock_attempts_student_idx" ON "mock_attempts" USING btree ("student_id","started_at");