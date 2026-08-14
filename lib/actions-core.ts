import { db } from "./db/client";
import * as schema from "./db/schema";
import { eq, and } from "drizzle-orm";
import {
  getProblem,
  getSkill,
  getProblemsForSkill,
  pushNotification,
  spendEnergy,
  updateSrsState,
  genId,
} from "./queries";
import { User } from "./types";

/**
 * Вся бизнес-логика отправки попытки решения — без ничего специфичного для
 * транспорта (никаких revalidatePath/redirect/NextResponse). Server Action
 * в app/actions.ts и API-роут /api/attempts вызывают ЭТУ функцию и просто
 * по-разному оборачивают результат — так логика не дублируется между вебом
 * и будущим мобильным клиентом.
 */
export async function performSubmitAttempt(
  user: User,
  problemId: string,
  answer: string,
  source: "lesson" | "assignment" | "review"
) {
  const problem = await getProblem(problemId);
  if (!problem) return { error: "Задача не найдена" as const };
  if (!answer.trim()) return { error: "Введите ответ" as const };

  const existingAttempts = await db
    .select({ id: schema.attempts.id })
    .from(schema.attempts)
    .where(and(eq(schema.attempts.studentId, user.id), eq(schema.attempts.problemId, problemId)))
    .limit(1);
  const isFirstAttempt = existingAttempts.length === 0;

  if (isFirstAttempt) {
    const ok = await db.transaction((tx) => spendEnergy(tx, user.id));
    if (!ok) return { kind: "no_energy" as const };
  }

  if (problem.answerType === "DETAILED") {
    if (user.teacherId) {
      const skill = problem.skillId ? await getSkill(problem.skillId) : undefined;
      await db.transaction(async (tx) => {
        await tx.insert(schema.attempts).values({
          id: genId("a"),
          studentId: user.id,
          problemId,
          answer,
          isCorrect: false,
          source,
          reviewStatus: "pending",
        });
        await pushNotification(tx, {
          userId: user.teacherId!,
          type: "review_pending",
          title: `${user.name}: решение ждёт проверки`,
          body: `Развёрнутое решение по навыку «${skill?.title ?? ""}» отправлено на проверку.`,
          link: `/teacher/student/${user.id}`,
        });
      });
      return { kind: "pending" as const };
    }

    await db.insert(schema.attempts).values({
      id: genId("a"),
      studentId: user.id,
      problemId,
      answer,
      isCorrect: true,
      source,
      reviewStatus: "self_checked",
    });
    return {
      kind: "correct" as const,
      explanation: problem.explanation,
      correctAnswer: problem.correctAnswer,
      selfChecked: true,
    };
  }

  const normalize = (s: string) => s.trim().replace(",", ".").replace(/\s+/g, "");
  const isCorrect = normalize(answer) === normalize(problem.correctAnswer);

  await db.insert(schema.attempts).values({
    id: genId("a"),
    studentId: user.id,
    problemId,
    answer,
    isCorrect,
    source,
  });

  // SRS обновляем только для "обучающих" источников (обычный урок и само
  // повторение) — попытки из ДЗ/контрольных на график повторения не влияют,
  // это отдельный, оценочный контекст.
  if (source === "lesson" || source === "review") {
    await db.transaction((tx) => updateSrsState(tx, user.id, problemId, isCorrect));
  }

  if (isCorrect && source === "lesson" && problem.skillId) {
    const skillProblems = await getProblemsForSkill(problem.skillId);
    const skillProblemIds = new Set(skillProblems.map((p) => p.id));
    const lessonCorrect = await db
      .select({ problemId: schema.attempts.problemId })
      .from(schema.attempts)
      .where(
        and(
          eq(schema.attempts.studentId, user.id),
          eq(schema.attempts.isCorrect, true),
          eq(schema.attempts.source, "lesson")
        )
      );
    const nowSolvedIds = new Set(
      lessonCorrect.filter((a) => skillProblemIds.has(a.problemId)).map((a) => a.problemId)
    );
    if (nowSolvedIds.size === skillProblems.length && skillProblems.length > 0) {
      const skill = await getSkill(problem.skillId);
      const parentLinks = await db
        .select()
        .from(schema.parentLinks)
        .where(eq(schema.parentLinks.studentId, user.id));
      await db.transaction(async (tx) => {
        for (const link of parentLinks) {
          await pushNotification(tx, {
            userId: link.parentId,
            type: "skill_completed",
            title: `${user.name} прошёл(а) навык «${skill?.title ?? ""}»`,
            body: `Все задачи навыка решены верно.`,
            link: `/parent/child/${user.id}`,
          });
        }
      });
    }
  }

  if (isCorrect) {
    return {
      kind: "correct" as const,
      explanation: problem.explanation,
      correctAnswer: problem.correctAnswer,
    };
  }

  const wrongRows = await db
    .select({ id: schema.attempts.id })
    .from(schema.attempts)
    .where(
      and(
        eq(schema.attempts.studentId, user.id),
        eq(schema.attempts.problemId, problemId),
        eq(schema.attempts.isCorrect, false)
      )
    );
  const wrongCount = wrongRows.length;
  const hintIndex = Math.min(wrongCount - 1, problem.hints.length - 1);

  return {
    kind: "wrong" as const,
    hint: problem.hints[hintIndex] ?? "Попробуйте перечитать теорию по этому навыку ещё раз.",
    wrongCount,
    canRevealSolution: wrongCount >= 3,
  };
}
