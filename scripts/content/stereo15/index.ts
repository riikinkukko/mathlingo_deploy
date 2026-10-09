// Стереометрия второй части: №14 ЕГЭ-2026 = №15 ЕГЭ-2027. Главы идут после
// «Многогранников» и «Тел вращения» в теме «Стереометрия». Данные —
// data.ts (собраны из конспектов курса; решения проверены расчётом).
import type { DB } from "../../../lib/types";
import { pushChaptersAt } from "../build";
import { stereoChapters } from "./data";

export function addStereo15(db: DB, stereoTopicId: string) {
  pushChaptersAt(db, stereoTopicId, stereoChapters, { prefix: "st15", ege: 15, startOrder: 3 });
}
