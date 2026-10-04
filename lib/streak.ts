// Серия дней подряд и заморозки серии (как в Duolingo).
//
// • День — по Москве (раньше считали по UTC, и задача в 01:00 МСК уходила во
//   «вчера»).
// • Днём серии считается день с хотя бы одной попыткой или день, «спасённый»
//   заморозкой (таблица streak_freeze_days).
// • Заморозки: стартовая одна, копятся до MAX_FREEZES, +1 за каждые 7 дней
//   подряд. Если ученик пропустил 1–2 дня и заморозок хватает на все
//   пропущенные дни — они тратятся автоматически при следующем подсчёте серии.
//   Не хватает — серия прерывается, заморозки не сгорают.
//
// Относительные импорты — модуль используется и воркером бота (tsx).
// lib/queries импортирует этот модуль, поэтому обратно его не импортируем.
import { pluralRu } from "./pluralize";
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "./db/client";
import * as schema from "./db/schema";

export const MAX_FREEZES = 2;
export const FREEZE_EVERY_DAYS = 7;

/** YYYY-MM-DD по Москве. */
export function mskDayKey(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
}

/** Дни (МСК) с попытками и дни, спасённые заморозкой. */
export async function loadStreakDays(studentId: string): Promise<{ active: Set<string>; frozen: Set<string> }> {
  const [activeRows, frozenRows] = await Promise.all([
    db.execute(sql`
      select distinct to_char(${schema.attempts.createdAt} at time zone 'Europe/Moscow', 'YYYY-MM-DD') as day
      from ${schema.attempts}
      where ${schema.attempts.studentId} = ${studentId}
    `),
    db
      .select({ day: schema.streakFreezeDays.day })
      .from(schema.streakFreezeDays)
      .where(eq(schema.streakFreezeDays.studentId, studentId)),
  ]);
  const rows = activeRows.rows as { day: string }[];
  return {
    active: new Set(rows.map((r) => r.day)),
    frozen: new Set(frozenRows.map((r) => r.day)),
  };
}

/** Длина серии: сегодня считается, если уже занимался; иначе считаем от вчера. */
export function streakFromDays(days: Set<string>, today: string): number {
  let cursor = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(cursor)) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

export type StreakInfo = {
  streak: number;
  freezes: number;
  /** Сегодня занимался — серия уже продлена. */
  activeToday: boolean;
  /** Дни текущей недели (Пн..Вс), спасённые заморозкой. */
  frozenDays: Set<string>;
};

async function notify(userId: string, title: string, body: string) {
  await db.insert(schema.notifications).values({
    id: `n_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    userId,
    type: "streak_frozen",
    title,
    body,
    link: "/student/profile",
    read: false,
  });
}

/**
 * Считает серию и по ходу «рассчитывается» по заморозкам: тратит их на
 * пропущенные дни и выдаёт новую за каждые 7 дней. Безопасно вызывать
 * параллельно: дни вставляются с ON CONFLICT DO NOTHING, списываем ровно
 * за реально вставленные, а выдачу защищает freeze_awarded_on.
 */
export async function settleStreak(studentId: string, now: Date = new Date()): Promise<StreakInfo> {
  const today = mskDayKey(now);
  const { active, frozen } = await loadStreakDays(studentId);
  const [u] = await db
    .select({ freezes: schema.users.streakFreezes, awardedOn: schema.users.freezeAwardedOn })
    .from(schema.users)
    .where(eq(schema.users.id, studentId));
  let freezes = u?.freezes ?? 0;
  const all = new Set([...active, ...frozen]);

  // 1. Пропуск: последний день серии раньше вчерашнего.
  const yesterday = addDays(today, -1);
  if (!all.has(yesterday) && freezes > 0) {
    let last: string | null = null;
    for (const d of all) if (d < today && (!last || d > last)) last = d;
    const gap = last ? daysBetween(last, today) - 1 : 0;
    if (last && gap >= 1 && gap <= freezes) {
      const gapDays = Array.from({ length: gap }, (_, i) => addDays(last!, i + 1));
      const inserted = await db
        .insert(schema.streakFreezeDays)
        .values(gapDays.map((day) => ({ studentId, day })))
        .onConflictDoNothing()
        .returning({ day: schema.streakFreezeDays.day });
      if (inserted.length > 0) {
        const charged = await db
          .update(schema.users)
          .set({ streakFreezes: sql`${schema.users.streakFreezes} - ${inserted.length}` })
          .where(and(eq(schema.users.id, studentId), sql`${schema.users.streakFreezes} >= ${inserted.length}`))
          .returning({ freezes: schema.users.streakFreezes });
        if (charged.length === 0) {
          // Заморозки успел потратить параллельный запрос — откатываем свои дни.
          await db.delete(schema.streakFreezeDays).where(
            and(
              eq(schema.streakFreezeDays.studentId, studentId),
              inArray(
                schema.streakFreezeDays.day,
                inserted.map((r) => r.day)
              )
            )
          );
        } else {
          freezes = charged[0].freezes;
          inserted.forEach((r) => all.add(r.day));
          inserted.forEach((r) => frozen.add(r.day));
          const n = inserted.length;
          await notify(
            studentId,
            n === 1 ? "❄️ Заморозка сохранила серию" : `❄️ ${n} заморозки сохранили серию`,
            `Ты пропустил(а) ${n === 1 ? "день" : `${n} дня`}, но серия не прервалась. Осталось заморозок: ${freezes} из ${MAX_FREEZES}.`
          ).catch(() => {});
        }
      } else {
        // Дни уже спас параллельный запрос.
        gapDays.forEach((d) => all.add(d));
      }
    }
  }

  const streak = streakFromDays(all, today);
  const activeToday = active.has(today);

  // 2. Выдача: сегодня закрыт 7-й (14-й, …) день подряд.
  if (activeToday && streak > 0 && streak % FREEZE_EVERY_DAYS === 0 && freezes < MAX_FREEZES && u?.awardedOn !== today) {
    const awarded = await db
      .update(schema.users)
      .set({ streakFreezes: sql`least(${schema.users.streakFreezes} + 1, ${MAX_FREEZES})`, freezeAwardedOn: today })
      .where(
        and(
          eq(schema.users.id, studentId),
          lt(schema.users.streakFreezes, MAX_FREEZES),
          or(isNull(schema.users.freezeAwardedOn), sql`${schema.users.freezeAwardedOn} <> ${today}`)
        )
      )
      .returning({ freezes: schema.users.streakFreezes });
    if (awarded.length > 0) {
      freezes = awarded[0].freezes;
      await notify(
        studentId,
        "❄️ Новая заморозка серии",
        `${streak} ${pluralRu(streak, ["день", "дня", "дней"])} подряд — держи заморозку. Если пропустишь день, она сохранит серию. Сейчас: ${freezes} из ${MAX_FREEZES}.`
      ).catch(() => {});
    }
  }

  return { streak, freezes, activeToday, frozenDays: frozen };
}
