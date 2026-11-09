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
import { isEmailConfigured, sendEmail } from "./email";
import { loadStreakDays, streakFromDays } from "./streak";

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://planimetrika.online").trim().replace(/\/$/, "");
}

/** Письмо с отчётами по всем детям родителя. */
export function weeklyEmailHtml(reports: { child: User; title: string; body: string }[]): string {
  const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const base = appUrl();
  const blocks = reports
    .map(
      (r) => `
    <div style="border:1px solid #DCEEE3;border-radius:14px;padding:16px;margin:0 0 16px">
      <p style="font-size:17px;font-weight:800;margin:0 0 10px">${esc(r.title)}</p>
      ${r.body
        .split("\n")
        .map((l) => `<p style="font-size:15px;line-height:1.5;margin:0 0 6px">${esc(l)}</p>`)
        .join("")}
      <a href="${base}/parent/child/${esc(r.child.id)}" style="display:inline-block;margin-top:8px;color:#0F5132;font-weight:800">Подробнее в кабинете →</a>
    </div>`
    )
    .join("");
  return `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#132A20">
    <p style="font-size:20px;font-weight:900;color:#0F5132;margin:0 0 20px">Планиметрика · итоги недели</p>
    ${blocks}
    <p style="font-size:12px;color:#8A8F8C;margin-top:24px">
      Отчёт приходит по воскресеньям. Отключить его можно в <a href="${base}/parent" style="color:#8A8F8C">кабинете родителя</a>.
    </p>
  </div>`;
}
import type { User } from "./types";

const TZ = "Europe/Moscow";
// Отчёт уходит в воскресенье с 19:00; если воркер в это время лежал —
// догоняем до полудня понедельника (раньше неделя просто пропадала).
const SEND_FROM_MIN = 19 * 60;
const CATCH_UP_UNTIL_MIN = 12 * 60;

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

/**
 * За какую неделю пора слать отчёт: воскресенье с 19:00 — текущая неделя,
 * понедельник до 12:00 — прошлая (догоняем пропуск). Иначе null. Экспорт — для тестов.
 */
export function reportWeekFor(now: Date): { key: string; start: Date } | null {
  const { weekday, minutes } = msk(now);
  if (weekday === "Sun" && minutes >= SEND_FROM_MIN) return weekStart(now);
  if (weekday === "Mon" && minutes < CATCH_UP_UNTIL_MIN) return weekStart(new Date(now.getTime() - 24 * 3600 * 1000));
  return null;
}

/** Текст отчёта по одному ребёнку за неделю, начинающуюся с weekStartAt (по умолчанию — текущую). */
export async function buildChildWeekReport(child: User, now: Date = new Date(), weekStartAt?: Date) {
  const start = weekStartAt ?? weekStart(now).start;
  const end = new Date(start.getTime() + 7 * 24 * 3600 * 1000);
  const [stats, weekly, homeworks, upcoming, mocks, doneLessonsRows, logRows, streakDays] = await Promise.all([
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
    // Темы из отчётов репетитора после занятий за эту неделю.
    db
      .select({ topic: schema.lessonLogs.topic })
      .from(schema.lessonLogs)
      .where(
        and(
          eq(schema.lessonLogs.studentId, child.id),
          gte(schema.lessonLogs.date, msk(start).day),
          lt(schema.lessonLogs.date, msk(end).day)
        )
      ),
    loadStreakDays(child.id),
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

  const topics = [...new Set(logRows.map((r) => r.topic.trim()).filter(Boolean))];
  if (topics.length > 0) lines.push(`Темы занятий: ${topics.slice(0, 4).join(", ")}`);

  // Серия дней подряд — только чтение (заморозки здесь не тратим).
  const streak = streakFromDays(new Set([...streakDays.active, ...streakDays.frozen]), msk(new Date(end.getTime() - 1)).day);
  if (streak >= 2) lines.push(`Серия: ${streak} ${pluralRu(streak, ["день", "дня", "дней"])} подряд`);

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
  const week = reportWeekFor(now);
  if (!week) return 0;
  const { key } = week;

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
    .returning({ id: schema.users.id, email: schema.users.email, chatId: schema.users.telegramChatId });

  let sent = 0;
  for (const p of claimed) {
    try {
      const children = await getChildrenOfParent(p.id);
      const reports: { child: User; title: string; body: string }[] = [];
      for (const child of children) {
        const r = await buildChildWeekReport(child, now, week.start);
        await pushNotification(db, {
          userId: p.id,
          type: "weekly_report",
          title: r.title,
          body: r.body,
          link: `/parent/child/${child.id}`,
        });
        reports.push({ child, ...r });
        sent++;
      }
      // Без Telegram отчёт видно только на сайте — поэтому дублируем письмом.
      if (!p.chatId && p.email && reports.length > 0 && isEmailConfigured()) {
        await sendEmail({ to: p.email, subject: reports[0].title, html: weeklyEmailHtml(reports) });
      }
    } catch (e) {
      console.error("[parent-weekly] не удалось отправить отчёт", p.id, e);
    }
  }
  return sent;
}
