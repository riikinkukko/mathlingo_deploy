"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { genId, getProblem, getUserById, pushNotification } from "@/lib/queries";

const MAX_MESSAGE = 1000;

function excerpt(s: string, n = 90) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

/**
 * «Не понял — спросить репетитора» из задачи. Повторный вопрос по той же
 * задаче, пока первый без ответа, не плодит новый — дописывает сообщение.
 */
export async function askTeacherAction(
  problemId: string,
  message: string,
  studentAnswer: string
): Promise<{ ok: true } | { error: string }> {
  const user = await getSessionUser();
  if (!user || user.role !== "STUDENT" || !user.teacherId) return { error: "Вопрос можно задать только своему репетитору" };
  const problem = await getProblem(problemId);
  if (!problem) return { error: "Задача не найдена" };
  const text = message.trim().slice(0, MAX_MESSAGE);
  const answer = studentAnswer.trim().slice(0, 300) || null;

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

  let id: string;
  if (open[0]) {
    id = open[0].id;
    await db
      .update(schema.studentQuestions)
      .set({
        message: [open[0].message, text].filter(Boolean).join("\n\n").slice(0, MAX_MESSAGE * 2),
        studentAnswer: answer ?? undefined,
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
    });
  }

  await pushNotification(db, {
    userId: user.teacherId,
    type: "question_asked",
    title: `${user.name}: не понял задачу${problem.egeTaskNumber ? ` (№${problem.egeTaskNumber})` : ""}`,
    body: text ? excerpt(text, 160) : `«${excerpt(problem.text)}»${answer ? ` · ответ ученика: ${answer}` : ""}`,
    link: `/teacher/questions#${id}`,
  });
  revalidatePath("/teacher/questions");
  revalidatePath("/teacher");
  revalidatePath("/student/questions");
  return { ok: true };
}

export type AnswerQuestionState = { ok?: boolean; at?: number; error?: string } | null;

/** Ответ репетитора — уходит ученику в приложение и в Telegram. */
export async function answerQuestionAction(_prev: AnswerQuestionState, formData: FormData): Promise<AnswerQuestionState> {
  const teacher = await getSessionUser();
  if (!teacher || teacher.role !== "TEACHER") return { error: "Нет доступа" };
  const id = String(formData.get("questionId") || "");
  const answer = String(formData.get("answer") || "").trim().slice(0, 3000);
  if (!answer) return { error: "Напишите ответ" };

  const rows = await db.select().from(schema.studentQuestions).where(eq(schema.studentQuestions.id, id)).limit(1);
  const q = rows[0];
  if (!q || q.teacherId !== teacher.id) return { error: "Вопрос не найден" };

  await db
    .update(schema.studentQuestions)
    .set({ answer, answeredAt: new Date() })
    .where(eq(schema.studentQuestions.id, id));

  const student = await getUserById(q.studentId);
  if (student) {
    await pushNotification(db, {
      userId: student.id,
      type: "question_answered",
      title: `${teacher.name} ответил(а) на вопрос`,
      body: excerpt(answer, 200),
      link: `/student/questions#${id}`,
    });
  }
  revalidatePath("/teacher/questions");
  revalidatePath("/teacher");
  revalidatePath("/student/questions");
  return { ok: true, at: Date.now() };
}
