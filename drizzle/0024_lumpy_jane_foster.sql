CREATE INDEX "assignment_sessions_hw_student_idx" ON "assignment_sessions" USING btree ("homework_id","student_id");--> statement-breakpoint
CREATE INDEX "attempts_student_created_idx" ON "attempts" USING btree ("student_id","created_at");--> statement-breakpoint
CREATE INDEX "attempts_student_problem_idx" ON "attempts" USING btree ("student_id","problem_id");--> statement-breakpoint
CREATE INDEX "homeworks_student_idx" ON "homeworks" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "homeworks_teacher_idx" ON "homeworks" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "lesson_logs_student_idx" ON "lesson_logs" USING btree ("student_id","created_at");--> statement-breakpoint
CREATE INDEX "lesson_logs_teacher_idx" ON "lesson_logs" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "mock_scores_student_idx" ON "mock_scores" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "scheduled_lessons_teacher_starts_idx" ON "scheduled_lessons" USING btree ("teacher_id","starts_at");--> statement-breakpoint
CREATE INDEX "scheduled_lessons_student_starts_idx" ON "scheduled_lessons" USING btree ("student_id","starts_at");--> statement-breakpoint
CREATE INDEX "student_notes_student_idx" ON "student_notes" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "student_payments_teacher_student_idx" ON "student_payments" USING btree ("teacher_id","student_id");--> statement-breakpoint
CREATE INDEX "student_questions_teacher_idx" ON "student_questions" USING btree ("teacher_id","created_at");--> statement-breakpoint
CREATE INDEX "student_questions_student_idx" ON "student_questions" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "users_teacher_idx" ON "users" USING btree ("teacher_id");