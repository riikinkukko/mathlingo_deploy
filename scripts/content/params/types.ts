// Общие типы и сборщик для темы «Параметры» (задание 18).
import type { DB, TheoryCard } from "../../../lib/types";

/** Задача с коротким числовым ответом — проверяется автоматически. */
export interface NumTask {
  kind: "num";
  text: string;
  answer: string;
  hints: string[];
  explanation: string;
  difficulty?: 1 | 2 | 3;
  tier?: "core" | "bank";
}

/** Развёрнутое решение — ученик сверяется с эталоном (или проверяет репетитор). */
export interface DetTask {
  kind: "det";
  text: string;
  /** эталонное решение по шагам (строки) */
  solution: string[];
  /** ответ в том виде, как его записывают на экзамене */
  answer: string;
  hints: string[];
  /** ключевая идея — показывается после самопроверки */
  idea: string;
  difficulty?: 1 | 2 | 3;
  tier?: "core" | "bank";
}

export type Task = NumTask | DetTask;

export interface SkillDef {
  /** короткий ключ — часть id, не меняется после публикации */
  key: string;
  title: string;
  theory: TheoryCard[];
  tasks: Task[];
}

export interface ChapterDef {
  key: string;
  title: string;
  skills: SkillDef[];
}

/**
 * Кладёт главы, навыки и задачи в общий накопитель сида. Id явные и
 * стабильные: prm_<глава>, prm_<навык>, prm_<навык>_<n>. Новые задачи
 * добавляйте в КОНЕЦ списка навыка — тогда id старых не сдвинутся.
 */
export function pushChapters(db: DB, topicId: string, chapters: ChapterDef[]) {
  chapters.forEach((ch, ci) => {
    const chId = `prm_${ch.key}`;
    db.subtopics.push({ id: chId, topicId, order: ci + 1, title: ch.title });
    ch.skills.forEach((sk, si) => {
      const skId = `prm_${sk.key}`;
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
            egeTaskNumber: 18,
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
            egeTaskNumber: 18,
            tier: t.tier ?? "core",
          });
        }
      });
    });
  });
}
