ALTER TABLE "users" ADD COLUMN "telegram_binding_version" text DEFAULT gen_random_uuid()::text NOT NULL;
--> statement-breakpoint
CREATE FUNCTION rotate_telegram_binding_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.telegram_binding_version := gen_random_uuid()::text;
  NEW.tg_report_lesson_id := NULL;
  NEW.tg_report_asked_at := NULL;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER rotate_telegram_binding_version BEFORE UPDATE OF telegram_chat_id ON users
FOR EACH ROW EXECUTE FUNCTION rotate_telegram_binding_version();
--> statement-breakpoint
UPDATE users SET tg_report_lesson_id = NULL, tg_report_asked_at = NULL WHERE tg_report_lesson_id IS NOT NULL OR tg_report_asked_at IS NOT NULL;
