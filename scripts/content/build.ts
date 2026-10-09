// Общий сборщик глав для контента с явными id (задание 6, стереометрия №15
// и т. п.). Типы — те же, что у темы «Параметры».
import type { DB } from "../../lib/types";
import type { ChapterDef } from "./params/types";

/**
 * Кладёт главы в существующую тему. Id: <prefix>_<глава>, <prefix>_<навык>,
 * <prefix>_<навык>_<n>. Новые задачи добавляйте в КОНЕЦ списка навыка.
 */
export function pushChaptersAt(
  db: DB,
  topicId: string,
  chapters: ChapterDef[],
  opts: { prefix: string; ege: number; startOrder: number }
) {
  chapters.forEach((ch, ci) => {
    const chId = `${opts.prefix}_${ch.key}`;
    db.subtopics.push({ id: chId, topicId, order: opts.startOrder + ci, title: ch.title });
    ch.skills.forEach((sk, si) => {
      const skId = `${opts.prefix}_${sk.key}`;
      db.skills.push({ id: skId, subtopicId: chId, order: si + 1, title: sk.title, theoryCards: sk.theory });
      sk.tasks.forEach((t, ti) => {
        const id = `${skId}_${ti + 1}`;
        if (t.kind === "num") {
          db.problems.push({
            id,
            skillId: skId,
            text: t.text,
            answerType: "NUMBER",
            correctAnswer: t.answer,
            hints: t.hints,
            explanation: t.explanation,
            difficulty: t.difficulty ?? 2,
            egeTaskNumber: opts.ege,
            tier: t.tier ?? "core",
          });
        } else {
          db.problems.push({
            id,
            skillId: skId,
            text: t.text,
            answerType: "DETAILED",
            correctAnswer: `${t.solution.join("\n")}\nОтвет: ${t.answer}`,
            hints: t.hints,
            explanation: `Ответ: ${t.answer}. ${t.idea}`,
            difficulty: t.difficulty ?? 3,
            egeTaskNumber: opts.ege,
            tier: t.tier ?? "core",
          });
        }
      });
    });
  });
}
