// «Напомнить» — репетитор одним нажатием пинает ученика, который давно не
// занимался: уведомление в приложении + Telegram (если привязан и сейчас не
// ночь). Не чаще раза в NUDGE_COOLDOWN_H часов на ученика — users.nudged_at
// ставится атомарно, так что двойное нажатие (в кабинете и в боте) не
// продублирует сообщение.
// Относительные импорты — модуль вызывается и из воркера бота (tsx).
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "./db/client";
import * as schema from "./db/schema";
import { getHomeworksForStudent, homeworkStatus, pushNotification } from "./queries";
import { isQuietHours } from "./lesson-reminders";
import { pluralRu } from "./pluralize";

export const NUDGE_COOLDOWN_H = 20;

export type NudgeResult =
  | { ok: true; studentName: string; viaTelegram: boolean }
  | { ok: false; reason: "not_found" | "too_soon"; studentName?: string };

export function nudgedRecently(nudgedAt: Date | string | null | undefined, now: Date = new Date()): boolean {
  if (!nudgedAt) return false;
  return now.getTime() - new Date(nudgedAt).getTime() < NUDGE_COOLDOWN_H * 3600 * 1000;
}

export async function nudgeStudent(teacherId: string, studentId: string, now: Date = new Date()): Promise<NudgeResult> {
  const [st] = await db
    .select({ id: schema.users.id, name: schema.users.name, teacherId: schema.users.teacherId })
    .from(schema.users)
    .where(eq(schema.users.id, studentId));
  if (!st || st.teacherId !== teacherId) return { ok: false, reason: "not_found" };

  const cutoff = new Date(now.getTime() - NUDGE_COOLDOWN_H * 3600 * 1000);
  const claimed = await db
    .update(schema.users)
    .set({ nudgedAt: now })
    .where(
      and(
        eq(schema.users.id, studentId),
        eq(schema.users.teacherId, teacherId),
        or(isNull(schema.users.nudgedAt), lt(schema.users.nudgedAt, cutoff))
      )
    )
    .returning({ id: schema.users.id, chatId: schema.users.telegramChatId });
  if (claimed.length === 0) return { ok: false, reason: "too_soon", studentName: st.name };

  const [teacher] = await db
    .select({ name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, teacherId));
  const teacherFirst = (teacher?.name ?? "").split(" ")[0] || "Репетитор";

  // Есть несданная домашка — напоминаем про неё, иначе зовём на «Путь».
  let link = "/student";
  let body = "Давно не виделись в Планиметрике. Реши сегодня пару задач — это минут десять.";
  for (const hw of await getHomeworksForStudent(studentId)) {
    if (!hw.studentId) continue; // авторские пробники платформы — не от репетитора
    const s = await homeworkStatus(hw, studentId);
    if (s.complete) continue;
    const left = s.total - s.done;
    link = `/student/homework/${hw.id}`;
    body = `Ждёт домашка «${hw.title}»: осталось ${left} ${pluralRu(left, ["задача", "задачи", "задач"])}${s.overdue ? " (срок уже прошёл)" : ""}. Загляни сегодня!`;
    break;
  }

  const viaTelegram = !!claimed[0].chatId && !isQuietHours(now);
  await pushNotification(db, {
    userId: studentId,
    type: "teacher_nudge",
    title: `👋 ${teacherFirst} напоминает о занятиях`,
    body,
    link,
    telegram: viaTelegram,
  });
  return { ok: true, studentName: st.name, viaTelegram };
}

/** Ученики репетитора без активности INACTIVE_DAYS+ дней (по последней попытке
 * или, если попыток нет, по дате регистрации). Для сводки в боте. */
export async function getInactiveStudents(teacherId: string, minDays = 3, now: Date = new Date()) {
  const rows = await db.execute(sql`
    select u.id, u.name, u.nudged_at,
           (select max(a.created_at) from ${schema.attempts} a where a.student_id = u.id) as last_at,
           u.created_at
    from ${schema.users} u
    where u.teacher_id = ${teacherId} and u.role = 'STUDENT'
  `);
  const DAY = 24 * 3600 * 1000;
  return (rows.rows as { id: string; name: string; nudged_at: string | null; last_at: string | null; created_at: string }[])
    .map((r) => {
      const ref = new Date(r.last_at ?? r.created_at);
      return {
        id: r.id,
        name: r.name,
        idleDays: Math.floor((now.getTime() - ref.getTime()) / DAY),
        neverActive: !r.last_at,
        nudgedRecently: nudgedRecently(r.nudged_at, now),
      };
    })
    .filter((r) => r.idleDays >= minDays)
    .sort((a, b) => b.idleDays - a.idleDays);
}
