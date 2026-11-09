-- Четырёхугольники на чертежах — в школьной записи: A снизу слева, B сверху
-- слева, C сверху справа, D снизу справа (AD — снизу, BC — сверху); у
-- параллелепипеда и пирамиды AD — переднее ребро. Компоненты чертежей
-- поменялись в коде; здесь — задачи, у которых пропорции/подписи были
-- заданы под прежнюю запись (то же самое теперь в scripts/seed.ts).
UPDATE "problems" SET "diagram" = "diagram" || '{"ab": 6, "ad": 10}'::jsonb WHERE "id" = 'p_69' AND "diagram"->>'kind' = 'parallelogram';--> statement-breakpoint
UPDATE "problems" SET "diagram" = "diagram" || '{"ab": 5, "ad": 7}'::jsonb WHERE "id" = 'p_75' AND "diagram"->>'kind' = 'parallelogram';--> statement-breakpoint
UPDATE "problems" SET "diagram" = ("diagram" - 'a') || '{"b": "7"}'::jsonb WHERE "id" = 'p_83' AND "diagram"->>'kind' = 'parallelogram';--> statement-breakpoint
UPDATE "problems" SET "diagram" = jsonb_set("diagram", '{segments,1,to}', '"D"') WHERE "id" = 'p_343' AND "diagram"->>'kind' = 'pyramid' AND "diagram"#>>'{segments,1,to}' = 'B';
