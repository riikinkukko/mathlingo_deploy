CREATE TABLE "student_group_members" (
	"group_id" text NOT NULL,
	"student_id" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_group_members_group_id_student_id_pk" PRIMARY KEY("group_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "student_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"teacher_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "homeworks" ADD COLUMN "group_id" text;--> statement-breakpoint
ALTER TABLE "homeworks" ADD COLUMN "batch_id" text;--> statement-breakpoint
ALTER TABLE "scheduled_lessons" ADD COLUMN "group_id" text;--> statement-breakpoint
ALTER TABLE "scheduled_lessons" ADD COLUMN "group_lesson_id" text;--> statement-breakpoint
ALTER TABLE "student_group_members" ADD CONSTRAINT "student_group_members_group_id_student_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."student_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_group_members" ADD CONSTRAINT "student_group_members_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_groups" ADD CONSTRAINT "student_groups_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "student_group_members_student_idx" ON "student_group_members" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "student_groups_teacher_idx" ON "student_groups" USING btree ("teacher_id");--> statement-breakpoint
ALTER TABLE "homeworks" ADD CONSTRAINT "homeworks_group_id_student_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."student_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_lessons" ADD CONSTRAINT "scheduled_lessons_group_id_student_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."student_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "homeworks_batch_idx" ON "homeworks" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "scheduled_lessons_group_lesson_idx" ON "scheduled_lessons" USING btree ("group_lesson_id");