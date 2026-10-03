-- Планиметрия в нумерации ЕГЭ: задачи с ответом-числом — №1, задачи с
-- развёрнутым решением/доказательством — №18 (раньше были вперемешку 1, 4,
-- 6, 13, 16). Затрагивает только задачи навыков темы «Планиметрия».
UPDATE "problems" p
SET "ege_task_number" = CASE WHEN p."answer_type" = 'DETAILED' THEN 18 ELSE 1 END
FROM "skills" s
JOIN "subtopics" st ON st."id" = s."subtopic_id"
JOIN "topics" t ON t."id" = st."topic_id"
WHERE p."skill_id" = s."id" AND t."title" = 'Планиметрия';
