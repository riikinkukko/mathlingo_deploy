import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { canStudentAccessProblem, genId, getProblem, pushNotification } from "@/lib/queries";
import { cleanImageDataUrl } from "@/lib/image-data";
import type { User } from "@/lib/types";

// Вопрос репетитору по задаче — общий для сайта (app/actions-questions.ts)
// и мобильного приложения (/api/m/questions).

export const MAX_QUESTION_MESSAGE = 1000;
const MAX_MESSAGE = MAX_QUESTION_MESSAGE;

export function excerpt(s: string, n = 90) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

/**
 * «Не понял — спросить репетитора» из задачи. Повторный вопрос по той же
 * задаче, пока первый без ответа, не плодит новый — дописывает сообщение.
 */
export async function performAskTeacher(
  user: User | null,
  problemId: string,
  message: string,
  studentAnswer: string,
  sketch?: string | null
): Promise<{ ok: true } | { error: string }> {
  if (!user || user.role !== "STUDENT" || !user.teacherId) return { error: "Вопрос можно задать только своему репетитору" };
  if (typeof problemId !== "string" || typeof message !== "string") return { error: "Некорректный запрос" };
  const problem = await getProblem(problemId);
  if (!problem) return { error: "Задача не найдена" };
  // Только по задаче, которую ученик и так может открыть (иначе по id можно
  // было бы вытащить текст любой задачи в уведомление).
  const allowed =
    (await canStudentAccessProblem(user, problem, "lesson")) ||
    (await canStudentAccessProblem(user, problem, "assignment"));
  if (!allowed) return { error: "Задача недоступна" };
  const text = message.trim().slice(0, MAX_MESSAGE);
  const answer = (typeof studentAnswer === "string" ? studentAnswer : "").trim().slice(0, 300) || null;
  // Снимок черновика: только JPEG/PNG data URL разумного размера.
  const sketchVal = cleanImageDataUrl(sketch);

  const open = await db
    .select({ id: schema.studentQuestions.id, message: schema.studentQuestions.message })
    .from(schema.studentQuestions)
    .where(
      and(
        eq(schema.studentQuestions.studentId, user.id),
        eq(schema.studentQuestions.problemId, problemId),
        isNull(schema.studentQuestions.answeredAt)
      )
    )
    .limit(1);

  if (!open[0]) {
    // Не больше 20 новых вопросов в сутки — чтобы не засыпать репетитора в Telegram.
    const [{ n }] = (
      await db.execute(sql`select count(*)::int as n from student_questions
        where student_id = ${user.id} and created_at > now() - interval '24 hours'`)
    ).rows as { n: number }[];
    if (Number(n) >= 20) return { error: "Сегодня уже много вопросов — репетитор ответит на них, потом задай новые" };
  }

  let id: string;
  if (open[0]) {
    id = open[0].id;
    await db
      .update(schema.studentQuestions)
      .set({
        message: [open[0].message, text].filter(Boolean).join("\n\n").slice(0, MAX_MESSAGE * 2),
        studentAnswer: answer ?? undefined,
        ...(sketchVal ? { sketch: sketchVal } : {}),
      })
      .where(eq(schema.studentQuestions.id, id));
  } else {
    id = genId("q");
    await db.insert(schema.studentQuestions).values({
      id,
      studentId: user.id,
      teacherId: user.teacherId,
      problemId,
      studentAnswer: answer,
      message: text,
      sketch: sketchVal,
    });
  }

  await pushNotification(db, {
    userId: user.teacherId,
    type: "question_asked",
    title: `${user.name}: не понял задачу${problem.egeTaskNumber ? ` (№${problem.egeTaskNumber})` : ""}`,
    body:
      (text ? excerpt(text, 160) : `«${excerpt(problem.text)}»${answer ? ` · ответ ученика: ${answer}` : ""}`) +
      (sketchVal ? " · приложен черновик" : ""),
    link: `/teacher/questions#${id}`,
  });
  return { ok: true };
}
