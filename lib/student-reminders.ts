// Вечернее напоминание ученику в Telegram (19:00–21:00 МСК), только если
// сегодня он ещё не занимался и есть повод:
//  • серия дней подряд > 0 — «не дай серии прерваться»;
//  • завтра срок домашки, а она не сдана.
// Только Telegram (без записи в колокольчик — в приложении это и так видно).
// Раз в день: users.evening_reminded_on ставится атомарно ДО отправки, так
// что второй экземпляр воркера не продублирует. Отключается учеником в
// профиле (users.tg_student_reminders).
// Относительные импорты — модуль работает в воркере бота (tsx, вне Next.js).
import { and, eq, gte, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "./db/client";
import * as schema from "./db/schema";
import { computeStreak, getHomeworksForStudent, homeworkStatus } from "./queries";
import { escapeTelegramHtml, sendTelegramMessage } from "./telegram";
import { pluralRu } from "./pluralize";

const TZ = "Europe/Moscow";
const SEND_FROM_MIN = 19 * 60;
const SEND_TO_MIN = 21 * 60;
const DAY_MS = 24 * 3600 * 1000;

function mskDay(d: Date) {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const g = (t: string) => f.find((p) => p.type === t)!.value;
  return { day: `${g("year")}-${g("month")}-${g("day")}`, minutes: Number(g("hour")) * 60 + Number(g("minute")) };
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
}

/** Текст напоминания или null, если писать незачем. Экспорт — для тестов. */
export async function buildEveningReminder(
  student: { id: string; name: string },
  now: Date = new Date()
): Promise<{ text: string; link: string } | null> {
  const { day } = mskDay(now);
  const todayStart = new Date(`${day}T00:00:00+03:00`);

  // Сегодня уже занимался — ничего не шлём.
  const [{ c }] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(schema.attempts)
    .where(and(eq(schema.attempts.studentId, student.id), gte(schema.attempts.createdAt, todayStart)));
  if (Number(c) > 0) return null;

  // Домашка со сроком до конца завтрашнего дня (ещё не просроченная) и не сданная.
  const tomorrowEnd = new Date(todayStart.getTime() + 2 * DAY_MS);
  const dueSoon: { title: string; left: number; id: string }[] = [];
  for (const hw of await getHomeworksForStudent(student.id)) {
    const due = new Date(hw.dueDate);
    if (due <= now || due > tomorrowEnd) continue;
    const st = await homeworkStatus(hw, student.id);
    if (!st.complete) dueSoon.push({ title: hw.title, left: st.total - st.done, id: hw.id });
  }

  const streak = await computeStreak(student.id);
  if (streak === 0 && dueSoon.length === 0) return null;

  const first = escapeTelegramHtml(student.name.split(" ")[0] || student.name);
  const lines: string[] = [];
  if (streak === 1) {
    lines.push(`🔥 ${first}, вчера ты начал(а) серию — реши сегодня хотя бы одну задачу, чтобы её продолжить.`);
  } else if (streak > 1) {
    lines.push(
      `🔥 ${first}, у тебя серия ${streak} ${pluralRu(streak, ["день", "дня", "дней"])} подряд — реши сегодня хотя бы одну задачу, чтобы она не прервалась.`
    );
  } else {
    lines.push(`👋 ${first}, сегодня ты ещё не занимался(ась).`);
  }
  for (const h of dueSoon.slice(0, 3)) {
    lines.push(
      `📚 Скоро срок: «${escapeTelegramHtml(h.title)}» — осталось ${h.left} ${pluralRu(h.left, ["задача", "задачи", "задач"])}.`
    );
  }
  const link = dueSoon.length > 0 ? `/student/homework/${dueSoon[0].id}` : "/student";
  return { text: lines.join("\n\n"), link };
}

/** Из воркера бота раз в несколько минут. Возвращает число отправленных напоминаний. */
export async function sendStudentEveningReminders(now: Date = new Date()): Promise<number> {
  const { day, minutes } = mskDay(now);
  if (minutes < SEND_FROM_MIN || minutes >= SEND_TO_MIN) return 0;

  // Атомарно «забираем» всех учеников на сегодня: проверяем каждого один раз.
  const claimed = await db
    .update(schema.users)
    .set({ eveningRemindedOn: day })
    .where(
      and(
        eq(schema.users.role, "STUDENT"),
        eq(schema.users.tgStudentReminders, true),
        isNotNull(schema.users.telegramChatId),
        or(isNull(schema.users.eveningRemindedOn), sql`${schema.users.eveningRemindedOn} <> ${day}`)
      )
    )
    .returning({ id: schema.users.id, name: schema.users.name, chatId: schema.users.telegramChatId });

  let sent = 0;
  const base = appUrl();
  for (const s of claimed) {
    try {
      const r = await buildEveningReminder(s, now);
      if (!r || !s.chatId) continue;
      const ok = await sendTelegramMessage(
        s.chatId,
        r.text,
        base ? { replyMarkup: { inline_keyboard: [[{ text: "Открыть Планиметрику", url: base + r.link }]] } } : {}
      );
      if (ok) sent++;
    } catch (e) {
      console.error("[student-reminders] не удалось отправить", s.id, e);
    }
  }
  return sent;
}
