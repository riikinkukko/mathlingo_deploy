CREATE TYPE "public"."teacher_invite_status" AS ENUM('pending', 'accepted', 'declined');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'teacher_invite';--> statement-breakpoint
CREATE TABLE "teacher_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"teacher_id" text NOT NULL,
	"student_id" text NOT NULL,
	"status" "teacher_invite_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "review_score" integer;--> statement-breakpoint
ALTER TABLE "teacher_invites" ADD CONSTRAINT "teacher_invites_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_invites" ADD CONSTRAINT "teacher_invites_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "teacher_invites_student_idx" ON "teacher_invites" USING btree ("student_id","status");--> statement-breakpoint
CREATE INDEX "teacher_invites_teacher_idx" ON "teacher_invites" USING btree ("teacher_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "teacher_invites_one_pending_idx" ON "teacher_invites" USING btree ("teacher_id","student_id") WHERE "teacher_invites"."status" = 'pending';