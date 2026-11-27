ALTER TABLE "parent_links" RENAME TO "parent_link_requests";
--> statement-breakpoint
ALTER TABLE "parent_link_requests" ADD COLUMN "verified_at" timestamptz;
--> statement-breakpoint
-- Old builds also see only independently verified relationships.
CREATE VIEW "parent_links" AS
  SELECT "parent_id", "student_id" FROM "parent_link_requests"
  WHERE "verified_at" IS NOT NULL
  WITH LOCAL CHECK OPTION;
--> statement-breakpoint
ALTER TABLE "parent_link_requests" RENAME CONSTRAINT "parent_links_parent_id_student_id_pk" TO "parent_link_requests_parent_id_student_id_pk";
--> statement-breakpoint
ALTER TABLE "parent_link_requests" RENAME CONSTRAINT "parent_links_parent_id_users_id_fk" TO "parent_link_requests_parent_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "parent_link_requests" RENAME CONSTRAINT "parent_links_student_id_users_id_fk" TO "parent_link_requests_student_id_users_id_fk";
