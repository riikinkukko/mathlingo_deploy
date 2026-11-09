// Ежедневные задания (как daily quests в Duolingo, но без давления).
//
// • Три задания на день, по Москве. Набор и цели зависят от ученика и даты
//   (детерминированно), поэтому весь день одинаковые, а назавтра — другие.
// • Прогресс не хранится — считается по попыткам за сегодня, как цель дня.
// • Выполнил все три — награда: +1 заморозка серии (если их меньше максимума).
//   Выдача атомарная (users.quest_reward_on), как у заморозок за 7 дней.
// • Задания посильные: 5–8 задач, никакой платы и «сгорающих» штрафов.
//
// Относительные импорты — модуль вызывается из lib/queries.ts-цепочки и тестов.
import { and, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "./db/client";
import * as schema from "./db/schema";
import { MAX_FREEZES, mskDayKey } from "./streak";

export type QuestKind = "solve" | "combo" | "new" | "fix" | "review";

export interface Quest {
  kind: QuestKind;
  title: string;
  target: number;
  progress: number;
  done: boolean;
}

export interface DailyQuests {
  day: string;
  quests: Quest[];
  allDone: boolean;
  /** Награду за сегодня уже выдали (или выдали только что). */
  rewarded: boolean;
  /** Только что выдана заморозка — показать праздник. */
  justRewarded: boolean;
  /** Была ли выдана именно заморозка (а не «просто молодец» при полном запасе). */
  freezeGiven: boolean;
}

/** Строковый хеш → число (FNV-1a), чтобы выбор заданий был стабильным в течение дня. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface QuestFacts {
  /** Попытки за сегодня по времени: problemId, верно ли, источник, ждёт ли проверки. */
  today: { problemId: string; isCorrect: boolean; source: string; pending: boolean }[];
  /** Задачи, решённые верно раньше сегодняшнего дня. */
  solvedBefore: Set<string>;
  /** Задачи, на которых была ошибка раньше, чем первый верный ответ сегодня. */
  fixedToday: number;
  /** Есть ли у ученика нерешённые ошибки. */
  hasOpenMistakes: boolean;
  /** Есть ли задачи к повторению. */
  hasDueReviews: boolean;
}

const plural = (n: number, f: [string, string, string]) => {
  const m10 = n % 10,
    m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return f[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return f[1];
  return f[2];
};

/** Чистая функция: набор заданий и прогресс по фактам за день. Экспорт — для тестов. */
export function buildQuests(userId: string, day: string, f: QuestFacts): Quest[] {
  const h = hash(`${userId}|${day}`);
  const solvedToday = new Set(f.today.filter((a) => a.isCorrect).map((a) => a.problemId));

  // Самая длинная цепочка верных ответов подряд (ответы на проверке не рвут цепочку).
  let run = 0,
    best = 0;
  for (const a of f.today) {
    if (a.pending) continue;
    run = a.isCorrect ? run + 1 : 0;
    best = Math.max(best, run);
  }
  const newSolved = [...solvedToday].filter((id) => !f.solvedBefore.has(id)).length;
  const reviewSolved = new Set(f.today.filter((a) => a.isCorrect && a.source === "review").map((a) => a.problemId)).size;

  const make = (kind: QuestKind, target: number, progress: number, title: string): Quest => ({
    kind,
    target,
    progress: Math.min(target, progress),
    done: progress >= target,
    title,
  });

  const solveN = [5, 6, 8][h % 3];
  const quests: Quest[] = [make("solve", solveN, solvedToday.size, `Реши ${solveN} задач верно`)];

  const comboN = [3, 4, 5][(h >>> 3) % 3];
  const newN = [2, 3][(h >>> 5) % 2];
  const combo = make("combo", comboN, best, `Ответь верно ${comboN} ${plural(comboN, ["раз", "раза", "раз"])} подряд`);
  const fresh = make("new", newN, newSolved, `Реши ${newN} ${plural(newN, ["новую задачу", "новые задачи", "новых задач"])}`);
  const comboFirst = ((h >>> 7) & 1) === 0;
  quests.push(comboFirst ? combo : fresh);

  if (f.hasOpenMistakes || f.fixedToday > 0) {
    quests.push(make("fix", 1, f.fixedToday, "Исправь одну ошибку"));
  } else if (f.hasDueReviews || reviewSolved > 0) {
    quests.push(make("review", 3, reviewSolved, "Реши 3 задачи в повторении"));
  } else {
    quests.push(comboFirst ? fresh : combo);
  }
  return quests;
}

type Row = { problemId: string; isCorrect: boolean; source: string; reviewStatus: string | null };
type Prev = Map<string, { problem_id: string; solved: boolean; wrong: boolean }>;
interface Raw {
  day: string;
  rows: Row[];
  prev: Prev;
  hasOpenMistakes: boolean;
  hasDueReviews: boolean;
}

/** Сырые данные за сегодняшний (МСК) день из базы. */
async function loadRaw(studentId: string, now: Date): Promise<Raw> {
  const day = mskDayKey(now);
  // Начало московских суток: МСК = UTC+3 без перехода на летнее время.
  const dayStart = new Date(`${day}T00:00:00+03:00`);
  const rows = await db
    .select({
      problemId: schema.attempts.problemId,
      isCorrect: schema.attempts.isCorrect,
      source: schema.attempts.source,
      reviewStatus: schema.attempts.reviewStatus,
    })
    .from(schema.attempts)
    .where(and(eq(schema.attempts.studentId, studentId), gte(schema.attempts.createdAt, dayStart)))
    .orderBy(schema.attempts.createdAt);

  const todayIds = [...new Set(rows.map((r) => r.problemId))];
  const [before, open, due] = await Promise.all([
    todayIds.length
      ? db.execute(sql`
          select problem_id,
                 bool_or(is_correct) as solved,
                 bool_or(not is_correct and review_status is null) as wrong
          from attempts
          where student_id = ${studentId} and created_at < ${dayStart}
            and problem_id in (${sql.join(todayIds.map((id) => sql`${id}`), sql`, `)})
          group by problem_id`)
      : Promise.resolve({ rows: [] as unknown[] }),
    db.execute(sql`
      select 1 from attempts a
      where a.student_id = ${studentId} and not a.is_correct and a.review_status is null
        and not exists (select 1 from attempts b where b.student_id = a.student_id and b.problem_id = a.problem_id and b.is_correct)
      limit 1`),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.srsStates)
      .where(and(eq(schema.srsStates.studentId, studentId), lt(schema.srsStates.nextReviewAt, now))),
  ]);
  return {
    day,
    rows,
    prev: new Map((before.rows as { problem_id: string; solved: boolean; wrong: boolean }[]).map((r) => [r.problem_id, r])),
    hasOpenMistakes: open.rows.length > 0,
    hasDueReviews: (due[0]?.n ?? 0) > 0,
  };
}

/** Факты для buildQuests по попыткам за день (можно передать срез — «до ответа»). */
function factsFrom(raw: Raw, rows: Row[]): QuestFacts {
  // «Исправил сегодня»: верный ответ сегодня по задаче, где до него была ошибка
  // (раньше сегодняшнего дня или сегодня же, но раньше первого верного).
  let fixedToday = 0;
  const seenWrongToday = new Set<string>();
  const counted = new Set<string>();
  for (const r of rows) {
    if (r.reviewStatus) continue;
    if (!r.isCorrect) {
      seenWrongToday.add(r.problemId);
      continue;
    }
    if (counted.has(r.problemId)) continue;
    const p = raw.prev.get(r.problemId);
    // Решённая когда-то раньше задача — не «ошибка», а просто повтор.
    if (!p?.solved && (p?.wrong || seenWrongToday.has(r.problemId))) fixedToday++;
    counted.add(r.problemId);
  }
  return {
    today: rows.map((r) => ({ problemId: r.problemId, isCorrect: r.isCorrect, source: r.source, pending: !!r.reviewStatus })),
    solvedBefore: new Set([...raw.prev].filter(([, v]) => v.solved).map(([k]) => k)),
    fixedToday,
    hasOpenMistakes: raw.hasOpenMistakes,
    hasDueReviews: raw.hasDueReviews,
  };
}

/**
 * Какие задания дня закрыл только что сделанный ответ (последняя попытка).
 * Для плашки «Задание дня выполнено» прямо в задаче. Награду не выдаёт —
 * это делает getDailyQuests при открытии главной.
 */
export async function questsJustCompleted(studentId: string, now: Date = new Date()): Promise<{ titles: string[]; allDone: boolean }> {
  const raw = await loadRaw(studentId, now);
  if (raw.rows.length === 0) return { titles: [], allDone: false };
  const after = buildQuests(studentId, raw.day, factsFrom(raw, raw.rows));
  const before = buildQuests(studentId, raw.day, factsFrom(raw, raw.rows.slice(0, -1)));
  const titles = after.filter((q) => q.done && !before.find((b) => b.kind === q.kind)?.done).map((q) => q.title);
  return { titles, allDone: titles.length > 0 && after.every((q) => q.done) };
}

/**
 * Задания на сегодня + выдача награды, если все выполнены. Безопасно звать
 * параллельно: награду забирает только один UPDATE … WHERE quest_reward_on <> today.
 */
export async function getDailyQuests(studentId: string, now: Date = new Date()): Promise<DailyQuests> {
  const raw = await loadRaw(studentId, now);
  const { day } = raw;
  const quests = buildQuests(studentId, day, factsFrom(raw, raw.rows));
  const allDone = quests.every((q) => q.done);

  const [u] = await db
    .select({ rewardOn: schema.users.questRewardOn, freezes: schema.users.streakFreezes })
    .from(schema.users)
    .where(eq(schema.users.id, studentId));
  let rewarded = u?.rewardOn === day;
  let justRewarded = false;
  let freezeGiven = false;

  if (allDone && !rewarded) {
    const claimed = await db
      .update(schema.users)
      .set({
        questRewardOn: day,
        streakFreezes: sql`least(${schema.users.streakFreezes} + 1, ${MAX_FREEZES})`,
      })
      .where(
        and(
          eq(schema.users.id, studentId),
          or(isNull(schema.users.questRewardOn), sql`${schema.users.questRewardOn} <> ${day}`)
        )
      )
      .returning({ freezes: schema.users.streakFreezes });
    if (claimed.length > 0) {
      rewarded = true;
      justRewarded = true;
      freezeGiven = (u?.freezes ?? 0) < MAX_FREEZES;
      await db
        .insert(schema.notifications)
        .values({
          id: `n_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
          userId: studentId,
          type: "streak_frozen",
          title: "🏆 Все задания дня выполнены",
          body: freezeGiven
            ? `Отличная работа! Держи заморозку серии — она выручит, если пропустишь день. Сейчас: ${claimed[0].freezes} из ${MAX_FREEZES}.`
            : "Отличная работа! Запас заморозок и так полный — так держать.",
          link: "/student",
          read: false,
        })
        .catch(() => {});
    }
  }
  return { day, quests, allDone, rewarded, justRewarded, freezeGiven };
}
