"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import {
  genId,
  getUserById,
  getScheduledLessonById,
  pushNotification,
} from "@/lib/queries";

// Все ученики платформы — российские (ЕГЭ), поэтому наивное время из
// <input type="datetime-local"> трактуем как московское, а не как локальное
// время сервера (Timeweb обычно в UTC — иначе занятия «уезжали» бы на 3 часа).
const MSK_OFFSET = "+03:00";

function parseMskDateTime(value: string): Date | null {
  // datetime-local отдаёт "YYYY-MM-DDTHH:MM" (без секунд).
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const d = new Date(`${value}:00${MSK_OFFSET}`);
  return isNaN(d.getTime()) ? null : d;
}

function formatMsk(d: Date): string {
  return d.toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function assertOwnsStudent(teacherId: string, studentId: string): Promise<boolean> {
  const s = await getUserById(studentId);
  return !!s && s.role === "STUDENT" && s.teacherId === teacherId;
}

/** Куда вернуться после действия: на страницу ученика или в общее расписание. */
function backTo(from: string, studentId: string): string {
  return from === "student" ? `/teacher/student/${studentId}` : "/teacher/schedule";
}

export type CreateLessonState = { ok?: boolean; error?: string; at?: number } | null;

/**
 * Планирование занятия. Работает через useFormState (без редиректа): так форма
 * на клиенте узнаёт об успехе и очищает поля, а ошибку показывает на месте.
 * Данные страниц обновляются через revalidatePath.
 */
export async function createLessonAction(
  _prev: CreateLessonState,
  formData: FormData
): Promise<CreateLessonState> {
  const teacher = await getSessionUser();
  const studentId = String(formData.get("studentId") || "");

  if (!teacher || teacher.role !== "TEACHER") return { error: "Доступ запрещён" };
  if (!studentId) return { error: "Выберите ученика" };
  if (!(await assertOwnsStudent(teacher.id, studentId))) return { error: "Ученик не найден" };

  const startsAt = parseMskDateTime(String(formData.get("startsAt") || ""));
  const durationMin = Math.max(15, Math.min(300, Number(formData.get("durationMin")) || 60));
  const topic = String(formData.get("topic") || "").trim() || null;

  if (!startsAt) return { error: "Укажите дату и время занятия" };

  await db.transaction(async (tx) => {
    await tx.insert(schema.scheduledLessons).values({
      id: genId("sl"),
      teacherId: teacher.id,
      studentId,
      startsAt,
      durationMin,
      topic,
      status: "planned",
    });

    await pushNotification(tx, {
      userId: studentId,
      type: "lesson_scheduled",
      title: `Занятие назначено: ${formatMsk(startsAt)}`,
      body: topic ? `Тема: ${topic}` : "Не пропусти — увидимся на занятии!",
      link: `/student`,
    });
  });

  revalidatePath("/teacher/schedule");
  revalidatePath("/teacher");
  revalidatePath(`/teacher/student/${studentId}`);
  // at — метка времени, чтобы два успешных сохранения подряд были разными
  // состояниями и эффект очистки формы срабатывал каждый раз.
  return { ok: true, at: Date.now() };
}

export async function setLessonStatusAction(formData: FormData) {
  const teacher = await getSessionUser();
  const lessonId = String(formData.get("lessonId") || "");
  const status = String(formData.get("status") || "");
  const from = String(formData.get("from") || "schedule");

  const lesson = await getScheduledLessonById(lessonId);
  const back = backTo(from, lesson?.studentId || "");

  if (!teacher || teacher.role !== "TEACHER") redirect(`${back}?error=1`);
  if (!lesson || lesson.teacherId !== teacher.id) redirect(`${back}?error=1`);
  if (status !== "done" && status !== "cancelled") redirect(`${back}?error=1`);

  await db
    .update(schema.scheduledLessons)
    .set({ status })
    .where(eq(schema.scheduledLessons.id, lessonId));

  revalidatePath("/teacher/schedule");
  revalidatePath("/teacher");
  revalidatePath(`/teacher/student/${lesson.studentId}`);
  redirect(`${back}?ok=lesson`);
}

export async function deleteLessonAction(formData: FormData) {
  const teacher = await getSessionUser();
  const lessonId = String(formData.get("lessonId") || "");
  const from = String(formData.get("from") || "schedule");

  const lesson = await getScheduledLessonById(lessonId);
  const back = backTo(from, lesson?.studentId || "");

  if (!teacher || teacher.role !== "TEACHER") redirect(`${back}?error=1`);
  if (!lesson || lesson.teacherId !== teacher.id) redirect(`${back}?error=1`);

  await db.delete(schema.scheduledLessons).where(eq(schema.scheduledLessons.id, lessonId));

  revalidatePath("/teacher/schedule");
  revalidatePath("/teacher");
  revalidatePath(`/teacher/student/${lesson.studentId}`);
  redirect(`${back}?ok=lesson`);
}
