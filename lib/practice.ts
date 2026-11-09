/**
 * Тренировки поверх общего потока «повторения» (ReviewFlow, source = "review"):
 *
 *  • «Работа над ошибками» — задачи, на которых ученик ошибся и ещё не решил
 *    верно (из урока, ДЗ, пробника, повторения). Раньше «Мои ошибки» вели
 *    в урок навыка, где задачи из ДЗ или банка могло не быть.
 *  • «Тренировка по номеру ЕГЭ» — подборка задач одного номера (клетка на
 *    карте экзамена): сначала ещё не решённые, потом остальные.
 *
 * Только задачи с навыком и кратким ответом: их проверка мгновенная, а доступ
 * через "review" проверяет queries.canStudentAccessProblem (Free-ограничения).
 * Верный ответ закрывает ошибку и кладёт задачу в интервальное повторение.
 */
import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { db } from "./db/client";
import * as schema from "./db/schema";
import {
  getMistakesForStudent,
  isEffectivelyPro,
  isSkillAccessibleOnFree,
  isStandaloneStudent,
  mapProblem,
} from "./queries";
import type { Problem, User } from "./types";

export const MISTAKE_PRACTICE_SIZE = 10;
export const NUMBER_PRACTICE_SIZE = 8;
export const EXAM_TASK_COUNT = 20;

export interface PracticeItem {
  problem: Problem;
  skillTitle: string;
}

/** Фильтр Free-ограничений одним запросом вместо запроса на каждую задачу. */
async function accessibleFilter(user: User, problems: Problem[]): Promise<Problem[]> {
  const isFree = isStandaloneStudent(user) && !isEffectivelyPro(user);
  if (!isFree) return problems;
  const skillIds = [...new Set(problems.map((p) => p.skillId).filter((x): x is string => !!x))];
  if (!skillIds.length) return [];
  const skills = await db.select().from(schema.skills).where(inArray(schema.skills.id, skillIds));
  const subIds = [...new Set(skills.map((s) => s.subtopicId))];
  const subs = subIds.length ? await db.select().from(schema.subtopics).where(inArray(schema.subtopics.id, subIds)) : [];
  const siblings = subIds.length
    ? await db
        .select({ id: schema.skills.id, order: schema.skills.order, subtopicId: schema.skills.subtopicId })
        .from(schema.skills)
        .where(inArray(schema.skills.subtopicId, subIds))
    : [];
  const ok = new Set<string>();
  for (const sk of skills) {
    const sub = subs.find((x) => x.id === sk.subtopicId);
    if (!sub) continue;
    const sib = siblings.filter((x) => x.subtopicId === sk.subtopicId);
    if (isSkillAccessibleOnFree(sk, sub.order, sib)) ok.add(sk.id);
  }
  return problems.filter((p) => p.answerType !== "DETAILED" && p.skillId && ok.has(p.skillId));
}

async function skillTitles(problems: Problem[]): Promise<Map<string, string>> {
  const ids = [...new Set(problems.map((p) => p.skillId).filter((x): x is string => !!x))];
  if (!ids.length) return new Map();
  const rows = await db
    .select({ id: schema.skills.id, title: schema.skills.title })
    .from(schema.skills)
    .where(inArray(schema.skills.id, ids));
  return new Map(rows.map((r) => [r.id, r.title]));
}

const autoChecked = (p: Problem) => !!p.skillId && p.answerType !== "DETAILED";

/** Нерешённые ошибки для тренировки + сколько всего нерешённых (для подписи). */
export async function getMistakePractice(user: User): Promise<{ items: PracticeItem[]; unresolved: number; locked: number }> {
  const mistakes = await getMistakesForStudent(user.id);
  const open = mistakes.filter((m) => !m.resolved);
  const candidates = open.map((m) => m.problem).filter(autoChecked);
  const allowed = await accessibleFilter(user, candidates);
  const titles = new Map(open.map((m) => [m.problem.id, m.skillTitle]));
  const items = allowed
    .slice(0, MISTAKE_PRACTICE_SIZE)
    .map((problem) => ({ problem, skillTitle: titles.get(problem.id) ?? "—" }));
  return { items, unresolved: open.length, locked: candidates.length - allowed.length };
}

/** Подборка по номеру ЕГЭ: сначала не решённые верно, потом остальные. */
export async function getNumberPractice(
  user: User,
  n: number
): Promise<{ items: PracticeItem[]; total: number; solved: number; locked: number }> {
  const rows = (
    await db
      .select()
      .from(schema.problems)
      .where(
        and(
          eq(schema.problems.egeTaskNumber, n),
          isNotNull(schema.problems.skillId),
          ne(schema.problems.answerType, "DETAILED")
        )
      )
  ).map(mapProblem);
  const solvedRows = rows.length
    ? await db
        .selectDistinct({ id: schema.attempts.problemId })
        .from(schema.attempts)
        .where(
          and(
            eq(schema.attempts.studentId, user.id),
            eq(schema.attempts.isCorrect, true),
            inArray(
              schema.attempts.problemId,
              rows.map((r) => r.id)
            )
          )
        )
    : [];
  const solved = new Set(solvedRows.map((r) => r.id));
  const allowed = await accessibleFilter(user, rows);
  // Перемешиваем, чтобы каждая тренировка была чуть другой, но не решённые — вперёд.
  const shuffled = [...allowed].sort(() => Math.random() - 0.5);
  const ordered = [...shuffled.filter((p) => !solved.has(p.id)), ...shuffled.filter((p) => solved.has(p.id))];
  const picked = ordered.slice(0, NUMBER_PRACTICE_SIZE);
  const titles = await skillTitles(picked);
  return {
    items: picked.map((problem) => ({ problem, skillTitle: titles.get(problem.skillId!) ?? "—" })),
    total: rows.length,
    solved: rows.filter((r) => solved.has(r.id)).length,
    locked: rows.length - allowed.length,
  };
}
