// Задачи на числа (теория чисел): №19 ЕГЭ-2026 = №20 ЕГЭ-2027. Отдельная тема
// с явными id (nt20_*). Данные — data.ts, собраны из конспектов курса.
import type { DB } from "../../../lib/types";
import { pushChaptersAt } from "../build";
import { ntChapters } from "./data";

export function addNumberTheory20(db: DB) {
  const topicId = "nt20_topic";
  db.topics.push({ id: topicId, order: 13, title: "Задачи на числа" });
  pushChaptersAt(db, topicId, ntChapters, { prefix: "nt20", ege: 20, startOrder: 1 });
}
