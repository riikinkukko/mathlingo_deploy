"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { pushNotification } from "@/lib/queries";
import { excerpt, performAskTeacher } from "@/lib/questions-core";
import { lockTeacherStudents } from "@/lib/student-links";

/** «Не понял — спросить репетитора» из задачи (логика — lib/questions-core.ts). */
export async function askTeacherAction(
  problemId: string,
  message: string,
  studentAnswer: string,
  sketch?: string | null
): Promise<{ ok: true } | { error: string }> {
  const res = await performAskTeacher(await getSessionUser(), problemId, message, studentAnswer, sketch);
  if ("ok" in res) {
    revalidatePath("/teacher/questions");
    revalidatePath("/teacher");
    revalidatePath("/student/questions");
  }
  return res;
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

  const changed = await db.transaction(async (tx) => {
    if (!(await lockTeacherStudents(tx, teacher.id, [q.studentId])).length) return false;
    const [updated] = await tx
      .update(schema.studentQuestions)
      .set({ answer, answeredAt: new Date() })
      .where(and(eq(schema.studentQuestions.id, id), eq(schema.studentQuestions.teacherId, teacher.id)))
      .returning({ id: schema.studentQuestions.id });
    if (!updated) return false;
    await pushNotification(tx, {
      userId: q.studentId,
      type: "question_answered",
      title: `${teacher.name} ответил(а) на вопрос`,
      body: excerpt(answer, 200),
      link: `/student/questions#${id}`,
    });
    return true;
  });
  if (!changed) return { error: "Вопрос не найден" };
  revalidatePath("/teacher/questions");
  revalidatePath("/teacher");
  revalidatePath("/student/questions");
  return { ok: true, at: Date.now() };
}
