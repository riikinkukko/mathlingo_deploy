CREATE TABLE "task_photos" (
	"id" text PRIMARY KEY NOT NULL,
	"teacher_id" text NOT NULL,
	"data" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "problems" ADD COLUMN "photo_id" text;--> statement-breakpoint
ALTER TABLE "task_photos" ADD CONSTRAINT "task_photos_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_photos_teacher_idx" ON "task_photos" USING btree ("teacher_id");--> statement-breakpoint
ALTER TABLE "problems" ADD CONSTRAINT "problems_photo_id_task_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."task_photos"("id") ON DELETE set null ON UPDATE no action;