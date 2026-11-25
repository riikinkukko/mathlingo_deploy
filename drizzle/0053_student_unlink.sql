ALTER TABLE "users"
  ADD COLUMN "teacher_link_version" text NOT NULL DEFAULT gen_random_uuid()::text,
  ADD COLUMN "independent_credentials" boolean NOT NULL DEFAULT false,
  ADD COLUMN "credential_handoff_pending" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
-- For an existing relationship, an accepted invitation shows that the login
-- existed before the relationship. Short logins still need a handoff.
UPDATE "users" AS u
SET "independent_credentials" = true
WHERE u."role" = 'STUDENT'
  AND lower(u."email") NOT LIKE '%@u.planimetrika.online'
  AND (
    u."teacher_id" IS NULL OR EXISTS (
      SELECT 1 FROM "teacher_invites" AS i
      WHERE i."student_id" = u."id" AND i."teacher_id" = u."teacher_id"
        AND i."status" = 'accepted'
    )
  );
--> statement-breakpoint
CREATE FUNCTION rotate_student_teacher_link_version() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.teacher_link_version := gen_random_uuid()::text;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER rotate_student_teacher_link_version
BEFORE UPDATE OF teacher_id ON users
FOR EACH ROW WHEN (OLD.teacher_id IS DISTINCT FROM NEW.teacher_id)
EXECUTE FUNCTION rotate_student_teacher_link_version();
--> statement-breakpoint
CREATE TABLE "student_unlinks" (
  "link_version" text PRIMARY KEY,
  "teacher_id" text NOT NULL,
  "student_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "student_unlinks_pair_idx" ON "student_unlinks" ("teacher_id", "student_id");
--> statement-breakpoint
ALTER TABLE "scheduled_lessons" ADD COLUMN "archived_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "student_payments" ADD COLUMN "archived_at" timestamptz;
--> statement-breakpoint
-- Old application builds must not be able to delete a student, including during rollback.
CREATE FUNCTION require_student_account_deletion_authorization() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('planimetrika.allow_student_account_delete', true) IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'Student account deletion requires a separate authorized process' USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER require_student_account_deletion_authorization
BEFORE DELETE ON users
FOR EACH ROW WHEN (OLD.role = 'STUDENT')
EXECUTE FUNCTION require_student_account_deletion_authorization();
