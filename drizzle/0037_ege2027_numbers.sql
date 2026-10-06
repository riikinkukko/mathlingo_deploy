-- Номера заданий по ЕГЭ-2027 (20 заданий). Прежние 6–11 → 7–12, 13–15 → 14–16,
-- экономическая задача (№16) → №13 (теперь в первой части), задание на
-- экстремум (№12) из экзамена убрано — номер снимаем. Параметры — №19.
-- Планиметрия (1 и 18), №17 и №1–5 не меняются; 17–19 у авторских задач
-- репетиторов не трогаем — их смысл в старой нумерации неоднозначен.
UPDATE "problems"
SET "ege_task_number" = CASE "ege_task_number"
  WHEN 6 THEN 7
  WHEN 7 THEN 8
  WHEN 8 THEN 9
  WHEN 9 THEN 10
  WHEN 10 THEN 11
  WHEN 11 THEN 12
  WHEN 12 THEN NULL
  WHEN 13 THEN 14
  WHEN 14 THEN 15
  WHEN 15 THEN 16
  WHEN 16 THEN 13
END
WHERE "ege_task_number" BETWEEN 6 AND 16
  AND "id" NOT LIKE 'prm\_%'
  AND "id" NOT LIKE 'd17\_%';
--> statement-breakpoint
UPDATE "problems" SET "ege_task_number" = 19 WHERE "id" LIKE 'prm\_%' AND "ege_task_number" = 18;
