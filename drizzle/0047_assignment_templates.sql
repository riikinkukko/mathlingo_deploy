CREATE TABLE "assignment_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"teacher_id" text NOT NULL,
	"title" text NOT NULL,
	"kind" "assignment_kind" NOT NULL,
	"allow_hints" boolean NOT NULL,
	"time_limit_minutes" integer,
	"problem_ids" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assignment_templates" ADD CONSTRAINT "assignment_templates_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assignment_templates_teacher_idx" ON "assignment_templates" USING btree ("teacher_id");