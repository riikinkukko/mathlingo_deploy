// Отметка занятия «Было / Не было» — общая логика для кабинета (server action)
// и для кнопок в Telegram (воркер бота). Относительные импорты: воркер
// работает через tsx вне Next.js.
import { eq } from "drizzle-orm";
import { db } from "./db/client";
import * as schema from "./db/schema";
import { getScheduledLessonById, getUserById } from "./queries";
import { sendPaymentReminder } from "./payment-reminders";
import type { ScheduledLesson } from "./types";

export type LessonMark = "done" | "cancelled" | "missed";

export type ApplyLessonStatusResult =
  | { ok: true; lesson: ScheduledLesson }
  | { ok: false; reason: "not_found" | "already_marked"; lesson?: ScheduledLesson };

/**
 * onlyIfPlanned — для Telegram: кнопку под старым сообщением можно нажать
 * повторно (или после отметки в кабинете), второй раз ничего не меняем.
 * В кабинете отметку можно менять, поэтому там onlyIfPlanned=false.
 */
export async function applyLessonStatus(
  teacherId: string,
  lessonId: string,
  status: LessonMark,
  { onlyIfPlanned = false }: { onlyIfPlanned?: boolean } = {}
): Promise<ApplyLessonStatusResult> {
  const lesson = await getScheduledLessonById(lessonId);
  if (!lesson || lesson.teacherId !== teacherId) return { ok: false, reason: "not_found" };
  if (onlyIfPlanned && lesson.status !== "planned") return { ok: false, reason: "already_marked", lesson };
  // Повторная та же отметка ничего не меняет — и не шлёт родителю второе напоминание.
  if (lesson.status === status) return { ok: true, lesson };

  // Цену фиксируем в момент отметки: если репетитор потом поменяет цену,
  // уже засчитанные занятия не пересчитаются.
  let priceRub: number | null = null;
  if (status === "done" || status === "missed") {
    const student = await getUserById(lesson.studentId);
    priceRub = (lesson.groupLessonId ? student?.groupLessonPriceRub ?? student?.lessonPriceRub : student?.lessonPriceRub) ?? null;
  }
  await db.update(schema.scheduledLessons).set({ status, priceRub }).where(eq(schema.scheduledLessons.id, lessonId));

  // Проведённое занятие меняет баланс оплат → при включённых напоминаниях
  // родитель узнает, что оплаченные занятия заканчиваются / закончились.
  // Сбой отправки не должен мешать самой отметке.
  // «Не пришёл» меняет баланс, только если у репетитора пропуск оплачивается.
  const charged = status === "done" || (status === "missed" && !!(await getUserById(teacherId))?.chargeMissed);
  if (charged) {
    try {
      await sendPaymentReminder(teacherId, lesson.studentId, "auto");
    } catch (e) {
      console.error("[payment-reminders] не удалось отправить напоминание", e);
    }
  }
  return { ok: true, lesson: { ...lesson, status } };
}
