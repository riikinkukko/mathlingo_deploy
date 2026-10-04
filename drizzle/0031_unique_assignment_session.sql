-- Дубли сессий (могли появиться при двух одновременных открытиях задания):
-- оставляем самую раннюю — от неё и считается время контрольной.
DELETE FROM "assignment_sessions" a
USING "assignment_sessions" b
WHERE a."homework_id" = b."homework_id"
  AND a."student_id" = b."student_id"
  AND (a."started_at" > b."started_at" OR (a."started_at" = b."started_at" AND a."id" > b."id"));--> statement-breakpoint
DROP INDEX IF EXISTS "assignment_sessions_hw_student_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "assignment_sessions_hw_student_uq" ON "assignment_sessions" USING btree ("homework_id","student_id");
