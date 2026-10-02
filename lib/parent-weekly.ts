// Недельный отчёт родителю: по воскресеньям вечером (19:00–23:00 МСК), по
// каждому ребёнку отдельное уведомление — в приложении и в Telegram (если
// привязан; отправку делает pushNotification). Отключается родителем на его
// странице (users.tg_weekly_report). Повтор за ту же неделю исключён:
// users.weekly_report_sent_on хранит понедельник отправленной недели и
// ставится атомарно до отправки.
// Относительные импорты — модуль работает в воркере бота (tsx, вне Next.js).
import { and, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "./db/client";
import * as schema from "./db/schema";
import {
  computeOverallStats,
  getChildrenOfParent,
  getHomeworksForStudent,
  homeworkStatus,
  getUpcomingLessonsForStudent,
  getMockScores,
  getStudentBalance,
  getWeeklyStats,
  pushNotification,
} from "./queries";
import { pluralRu } from "./pluralize";
import type { User } from "./types";

const TZ = "Europe/Moscow";
const SEND_FROM_MIN = 19 * 60;
const SEND_TO_MIN = 23 * 60;

function msk(d: Date) {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(d);
  const g = (t: string) => f.find((p) => p.type === t)!.value;
  return {
    day: `${g("year")}-${g("month")}-${g("day")}`,
    weekday: g("weekday"), // Mon..Sun
    minutes: Number(g("hour")) * 60 + Number(g("minute")),
  };
}

/** Понедельник текущей недели по Москве (YYYY-MM-DD) и его начало как Date. */
function weekStart(now: Date): { key: string; start: Date } {
  const { day } = msk(now);
  const d = new Date(`${day}T00:00:00+03:00`);
  const dow = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 = понедельник
  const start = new Date(d.getTime() - dow * 24 * 3600 * 1000);
  return { key: msk(start).day, start };
}

function dateShort(d: Date) {
  return d.toLocaleDateString("ru-RU", { timeZone: TZ, day: "numeric", month: "short" });
}

/** Текст отчёта по одному ребёнку. */
export async function buildChildWeekReport(child: User, now: Date = new Date()) {
  const { start } = weekStart(now);
  const end = new Date(start.getTime() + 7 * 24 * 3600 * 1000);
  const [stats, weekly, homeworks, upcoming, mocks, doneLessonsRows] = await Promise.all([
    computeOverallStats(child.id),
    getWeeklyStats(child.id, 1),
    getHomeworksForStudent(child.id),
    getUpcomingLessonsForStudent(child.id),
    getMockScores(child.id),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(schema.scheduledLessons)
      .where(
        and(
          eq(schema.scheduledLessons.studentId, child.id),
          eq(schema.scheduledLessons.status, "done"),
          gte(schema.scheduledLessons.startsAt, start),
          lt(schema.scheduledLessons.startsAt, end)
        )
      ),
  ]);
  const week = weekly[weekly.length - 1] ?? { solved: 0, accuracy: null };
  const first = child.name.split(" ")[0] || child.name;
  const lines: string[] = [];

  lines.push(
    stats.activeDaysLast7 > 0
      ? `В приложении: ${stats.activeDaysLast7} ${pluralRu(stats.activeDaysLast7, ["день", "дня", "дней"])} из 7 · ${week.solved} ${pluralRu(week.solved, ["задача", "задачи", "задач"])}${week.accuracy !== null ? ` · точность ${week.accuracy}%` : ""}`
      : "В приложении на этой неделе не занимался(ась)"
  );

  // Домашка: задания со сроком на этой неделе и всё ещё не сданное.
  const relevant = [];
  for (const hw of homeworks) {
    const st = await homeworkStatus(hw, child.id);
    if (new Date(hw.dueDate) >= start || !st.complete) relevant.push({ hw, st });
  }
  if (relevant.length > 0) {
    const done = relevant.filter((r) => r.st.complete).length;
    const overdue = relevant.filter((r) => r.st.overdue).length;
    lines.push(`Домашка: сдано ${done} из ${relevant.length}${overdue ? ` · просрочено ${overdue}` : ""}`);
  }

  const doneLessons = Number(doneLessonsRows[0]?.c ?? 0);
  const next = upcoming[0];
  if (doneLessons > 0 || next) {
    const nextLabel = next
      ? new Date(next.startsAt).toLocaleString("ru-RU", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
      : null;
    lines.push(
      `С репетитором: ${doneLessons} ${pluralRu(doneLessons, ["занятие", "занятия", "занятий"])}${nextLabel ? ` · следующее ${nextLabel}` : ""}`
    );
  }

  const lastMock = mocks[0];
  if (lastMock) {
    lines.push(`Последний пробник: ${lastMock.score}${child.targetScore ? ` из цели ${child.targetScore}` : ""}`);
  }

  if (child.paymentRemindersEnabled && child.teacherId) {
    const b = await getStudentBalance(child.teacherId, child.id);
    if (b) {
      const n = Math.abs(b.balance);
      lines.push(
        b.balance > 0
          ? `Оплачено ещё ${n} ${pluralRu(n, ["занятие", "занятия", "занятий"])}`
          : b.balance < 0
            ? `Не оплачено ${n} ${pluralRu(n, ["занятие", "занятия", "занятий"])}`
            : "Оплаченные занятия закончились"
      );
    }
  }

  const lastDay = new Date(end.getTime() - 1);
  return {
    title: `Неделя: ${first} · ${dateShort(start)} – ${dateShort(lastDay)}`,
    body: lines.join("\n"),
  };
}

/** Из воркера бота раз в несколько минут. Возвращает число отправленных отчётов. */
export async function sendParentWeeklyReports(now: Date = new Date()): Promise<number> {
  const { weekday, minutes } = msk(now);
  if (weekday !== "Sun" || minutes < SEND_FROM_MIN || minutes >= SEND_TO_MIN) return 0;
  const { key } = weekStart(now);

  const claimed = await db
    .update(schema.users)
    .set({ weeklyReportSentOn: key })
    .where(
      and(
        eq(schema.users.role, "PARENT"),
        eq(schema.users.tgWeeklyReport, true),
        or(isNull(schema.users.weeklyReportSentOn), sql`${schema.users.weeklyReportSentOn} <> ${key}`)
      )
    )
    .returning({ id: schema.users.id });

  let sent = 0;
  for (const p of claimed) {
    try {
      const children = await getChildrenOfParent(p.id);
      for (const child of children) {
        const r = await buildChildWeekReport(child, now);
        await pushNotification(db, {
          userId: p.id,
          type: "weekly_report",
          title: r.title,
          body: r.body,
          link: `/parent/child/${child.id}`,
        });
        sent++;
      }
    } catch (e) {
      console.error("[parent-weekly] не удалось отправить отчёт", p.id, e);
    }
  }
  return sent;
}
