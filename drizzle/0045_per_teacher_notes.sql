-- Заметки репетитора: ключ «ученик» → «ученик + репетитор», чтобы после смены
-- репетитора новый не видел и не перезаписывал заметки прежнего. Данные сохраняются.
DO $$
DECLARE pk text;
BEGIN
  SELECT constraint_name INTO pk FROM information_schema.table_constraints
  WHERE table_schema = 'public' AND table_name = 'student_notes' AND constraint_type = 'PRIMARY KEY';
  IF pk IS NOT NULL THEN
    EXECUTE format('ALTER TABLE "student_notes" DROP CONSTRAINT %I', pk);
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_student_id_teacher_id_pk" PRIMARY KEY("student_id","teacher_id");
