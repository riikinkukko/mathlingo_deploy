CREATE TABLE "telegram_updates" (
  "id" integer PRIMARY KEY NOT NULL,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tg_report_prompt_id" integer;
--> statement-breakpoint
CREATE INDEX "telegram_updates_received_at_idx" ON "telegram_updates" USING btree ("received_at");
--> statement-breakpoint
UPDATE users SET tg_report_lesson_id = NULL, tg_report_asked_at = NULL WHERE tg_report_lesson_id IS NOT NULL OR tg_report_asked_at IS NOT NULL;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION rotate_telegram_binding_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.telegram_binding_version := gen_random_uuid()::text;
  NEW.tg_report_lesson_id := NULL;
  NEW.tg_report_asked_at := NULL;
  NEW.tg_report_prompt_id := NULL;
  RETURN NEW;
END;
$$;
