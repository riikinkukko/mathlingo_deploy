// Напоминания о занятиях: ученику и его родителям — в уведомления приложения
// и в Telegram (если привязан; отправку в Telegram делает pushNotification).
//
// Запускается из воркера бота (scripts/telegram-poller.ts) раз в несколько
// минут. Относительные импорты — воркер работает через tsx вне Next.js.
import { mskDayKey } from "./lesson-time";
import { and, eq, gt, isNull, lte, sql } from "drizzle-orm";
import { db } from "./db/client";
import * as schema from "./db/schema";
import { pushNotification } from "./queries";
import { lockStudent } from "./student-links";

/** За сколько до начала напоминаем. */
export const REMIND_BEFORE_MS = 2 * 3600 * 1000;
/**
 * Если занятие поставили меньше чем за столько до начала, отдельное
 * напоминание не шлём: ученик только что получил «Занятие назначено».
 */
const MIN_LEAD_MS = 3 * 3600 * 1000;
/** Тихие часы по Москве: не пишем с 23:00 до 8:00. */
const QUIET_FROM = 23;
const QUIET_TO = 8;

function mskHour(d: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Moscow", hour: "2-digit", hourCycle: "h23" }).format(d)
  );
}

function mskTime(d: Date): string {
  return d.toLocaleTimeString("ru-RU", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit" });
}

export function isQuietHours(now: Date): boolean {
  const h = mskHour(now);
  return h >= QUIET_FROM || h < QUIET_TO;
}

/**
 * Отправляет напоминания о занятиях, которые начнутся в ближайшие 2 часа.
 * Возвращает, сколько занятий обработано.
 *
 * Для каждого занятия под блокировкой ученика проверяем связь и атомарно
 * ставим reminded_at вместе с уведомлениями. В тихие часы ничего не забираем: утреннее
 * занятие (например, в 9:00) получит напоминание в 8:00, как только тихие
 * часы закончатся, — окно «2 часа до начала» ещё не прошло.
 */
export async function sendDueLessonReminders(now: Date = new Date()): Promise<number> {
  if (isQuietHours(now)) return 0;

  const windowEnd = new Date(now.getTime() + REMIND_BEFORE_MS);
  const due = and(
    eq(schema.scheduledLessons.status, "planned"),
    isNull(schema.scheduledLessons.remindedAt),
    isNull(schema.scheduledLessons.archivedAt),
    gt(schema.scheduledLessons.startsAt, now),
    lte(schema.scheduledLessons.startsAt, windowEnd),
    sql`${schema.scheduledLessons.startsAt} - ${schema.scheduledLessons.createdAt} >= make_interval(secs => ${MIN_LEAD_MS / 1000})`
  );
  const candidates = await db.select().from(schema.scheduledLessons).where(due);
  let sent = 0;
  for (const candidate of candidates) {
    try {
      const claimed = await db.transaction(async (tx) => {
        const student = await lockStudent(tx, candidate.studentId);
        if (student?.teacherId !== candidate.teacherId) return false;
        const [lesson] = await tx.update(schema.scheduledLessons).set({ remindedAt: now })
          .where(and(eq(schema.scheduledLessons.id, candidate.id), due)).returning();
        if (!lesson) return false;
        const time = mskTime(lesson.startsAt);
        // Занятие сразу после полуночи напоминается накануне вечером — «завтра», а не «сегодня».
        const sameDay = mskDayKey(lesson.startsAt) === mskDayKey(now);
        const title = `Напоминание: занятие ${sameDay ? "сегодня" : "завтра"} в ${time}`;
        const body = lesson.topic ? `Тема: ${lesson.topic}` : "Подготовь тетрадь и вопросы — до встречи!";
        const parents = await tx.select().from(schema.parentLinks).where(eq(schema.parentLinks.studentId, lesson.studentId));
        const teacherLink = { studentId: student.id, teacherId: lesson.teacherId, version: student.teacherLinkVersion };

        await pushNotification(tx, {
          userId: lesson.studentId,
          type: "lesson_scheduled",
          title,
          body,
          link: "/student",
          teacherLink,
        });
        for (const p of parents) {
          await pushNotification(tx, {
            userId: p.parentId,
            type: "lesson_scheduled",
            title: `Сегодня в ${time} — занятие у ребёнка`,
            body: lesson.topic ? `Тема: ${lesson.topic}` : "Занятие по математике с репетитором.",
            link: `/parent/child/${lesson.studentId}`,
            teacherLink,
          });
        }
        return true;
      });
      if (claimed) sent++;
    } catch (e) {
      // Одно сломанное занятие не должно останавливать остальные.
      console.error("[lesson-reminders] не удалось отправить напоминание", candidate.id, e);
    }
  }
  return sent;
}
