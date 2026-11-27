// Отметка занятия «Было / Не было» — общая логика для кабинета (server action)
// и для кнопок в Telegram (воркер бота). Относительные импорты: воркер
// работает через tsx вне Next.js.
import { and, eq, isNull } from "drizzle-orm";
import { db } from "./db/client";
import * as schema from "./db/schema";
import { getScheduledLessonById, getUserById, mapScheduledLesson } from "./queries";
import { sendPaymentReminder } from "./payment-reminders";
import { lockStudent, lockTelegramTeacher } from "./student-links";
import type { ScheduledLesson } from "./types";

export type LessonMark = "done" | "cancelled" | "missed" | "planned";

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
  { onlyIfPlanned = false, telegramChatId }: { onlyIfPlanned?: boolean; telegramChatId?: string } = {}
): Promise<ApplyLessonStatusResult> {
  const lesson = await getScheduledLessonById(lessonId);
  if (!lesson || lesson.teacherId !== teacherId) return { ok: false, reason: "not_found" };
  const result = await db.transaction(async (tx): Promise<ApplyLessonStatusResult & { changed?: boolean }> => {
    const student = await lockStudent(tx, lesson.studentId);
    if (student?.teacherId !== teacherId || (telegramChatId && !await lockTelegramTeacher(tx, teacherId, telegramChatId))) return { ok: false, reason: "not_found" };
    const L = schema.scheduledLessons;
    const condition = and(eq(L.id, lessonId), eq(L.teacherId, teacherId), isNull(L.archivedAt));
    const [current] = await tx.select().from(L).where(condition).for("update");
    if (!current) return { ok: false, reason: "not_found" };
    if (onlyIfPlanned && current.status !== "planned") {
      return { ok: false, reason: "already_marked", lesson: mapScheduledLesson(current) };
    }
    if (current.status === status) return { ok: true, lesson: mapScheduledLesson(current) };
    const priceRub = status === "done" || status === "missed"
      ? (current.groupLessonId ? student.groupLessonPriceRub ?? student.lessonPriceRub : student.lessonPriceRub)
      : null;
    const [updated] = await tx.update(L).set({ status, priceRub }).where(condition).returning();
    return { ok: true, lesson: mapScheduledLesson(updated), changed: true };
  });
  if (!result.ok || !result.changed) return result;

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
  return { ok: true, lesson: result.lesson };
}
