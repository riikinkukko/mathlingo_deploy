/**
 * Пробник ЕГЭ: работа с базой. Формат, баллы и сборка варианта — lib/mock-exam.ts.
 *
 * Жизненный цикл попытки:
 *   старт (фиксируем задачи варианта и дедлайн) → автосохранение ответов,
 *   флажков и времени → сдача (проверка первой части, вторая часть уходит
 *   репетитору или в самопроверку) → пересчёт баллов по мере проверки.
 */
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "./db/client";
import * as schema from "./db/schema";
import type { User } from "./types";
import { genId, getProblem, isEffectivelyPro, isStandaloneStudent, pushNotification } from "./queries";
import { answersMatch } from "./actions-core";
import { cleanImageDataUrl } from "./image-data";
import {
  FREE_VARIANTS,
  MOCK_MODES,
  MOCK_VARIANT_COUNT,
  MockMode,
  buildPools,
  buildVariant,
  isPart1,
  maxPointsForSlot,
  normalizeBlankAnswer,
  primaryToTest,
} from "./mock-exam";

export type MockAttemptRow = typeof schema.mockAttempts.$inferSelect;

/** После конца отсчёта ещё минуту принимаем последнее автосохранение. */
const SAVE_GRACE_MS = 60_000;
/** Через сколько после дедлайна неоконченный пробник сдаётся автоматически. */
const AUTO_FINISH_MS = 2 * 60_000;
const PART1_ANSWER_MAX = 20;
const PART2_TEXT_MAX = 4000;
const TASK_SECONDS_MAX = 5 * 3600;

// ---------------- Доступ и варианты ----------------

export function mockAccess(user: User): { all: boolean } {
  // Ученики репетитора и Pro — все варианты; Free — только открытые.
  return { all: !isStandaloneStudent(user) || isEffectivelyPro(user) };
}

export function canOpenVariant(user: User, variant: number): boolean {
  if (user.role !== "STUDENT") return false;
  if (!Number.isInteger(variant) || variant < 1 || variant > MOCK_VARIANT_COUNT) return false;
  return mockAccess(user).all || FREE_VARIANTS.includes(variant);
}

let poolCache: { at: number; pools: Map<number, string[]> } | null = null;

async function getPools(): Promise<Map<number, string[]>> {
  if (poolCache && Date.now() - poolCache.at < 5 * 60_000) return poolCache.pools;
  const rows = await db
    .select({
      id: schema.problems.id,
      egeTaskNumber: schema.problems.egeTaskNumber,
      answerType: schema.problems.answerType,
      correctAnswer: schema.problems.correctAnswer,
      skillId: schema.problems.skillId,
    })
    .from(schema.problems);
  const pools = buildPools(rows);
  poolCache = { at: Date.now(), pools };
  return pools;
}

// ---------------- Чтение ----------------

export async function getMockAttempt(id: string, studentId: string): Promise<MockAttemptRow | undefined> {
  if (typeof id !== "string" || !id) return undefined;
  const rows = await db
    .select()
    .from(schema.mockAttempts)
    .where(and(eq(schema.mockAttempts.id, id), eq(schema.mockAttempts.studentId, studentId)))
    .limit(1);
  return rows[0];
}

/** Для репетитора: пробник своего ученика. */
export async function getMockAttemptById(id: string): Promise<MockAttemptRow | undefined> {
  const rows = await db.select().from(schema.mockAttempts).where(eq(schema.mockAttempts.id, id)).limit(1);
  return rows[0];
}

export async function listMockAttempts(studentId: string): Promise<MockAttemptRow[]> {
  return db
    .select()
    .from(schema.mockAttempts)
    .where(eq(schema.mockAttempts.studentId, studentId))
    .orderBy(desc(schema.mockAttempts.startedAt));
}

export async function getActiveMock(studentId: string): Promise<MockAttemptRow | undefined> {
  const rows = await db
    .select()
    .from(schema.mockAttempts)
    .where(and(eq(schema.mockAttempts.studentId, studentId), isNull(schema.mockAttempts.finishedAt)))
    .orderBy(desc(schema.mockAttempts.startedAt))
    .limit(1);
  return rows[0];
}

export function isMockExpired(m: MockAttemptRow, now = Date.now(), graceMs = 0): boolean {
  return !!m.deadlineAt && now > new Date(m.deadlineAt).getTime() + graceMs;
}

/** Время вышло давно, а ученик не вернулся — сдаём за него то, что сохранено. */
export async function autoFinishIfExpired(user: User, m: MockAttemptRow): Promise<MockAttemptRow> {
  if (m.finishedAt || !isMockExpired(m, Date.now(), AUTO_FINISH_MS)) return m;
  await finishMock(user, m.id);
  return (await getMockAttempt(m.id, user.id)) ?? m;
}

export async function getMockImages(mockId: string): Promise<Record<string, string>> {
  const rows = await db
    .select({ problemId: schema.mockImages.problemId, data: schema.mockImages.data })
    .from(schema.mockImages)
    .where(eq(schema.mockImages.mockAttemptId, mockId));
  return Object.fromEntries(rows.map((r) => [r.problemId, r.data]));
}

// ---------------- Старт ----------------

export async function startMock(
  user: User,
  variant: number,
  mode: MockMode
): Promise<{ id: string } | { error: string } | { activeId: string }> {
  if (!canOpenVariant(user, variant)) return { error: "Этот вариант доступен на Pro" };
  const active = await getActiveMock(user.id);
  if (active) {
    const fresh = await autoFinishIfExpired(user, active);
    // Одновременно идёт только один пробник — сначала закончить начатый.
    if (!fresh.finishedAt) return { activeId: fresh.id };
  }
  const modeInfo = MOCK_MODES[mode];
  const items = buildVariant(await getPools(), variant, modeInfo.part2);
  if (items.length === 0) return { error: "В банке пока нет задач для пробника" };
  const id = genId("mk");
  const now = new Date();
  await db.insert(schema.mockAttempts).values({
    id,
    studentId: user.id,
    variant,
    mode,
    items,
    startedAt: now,
    deadlineAt: modeInfo.minutes ? new Date(now.getTime() + modeInfo.minutes * 60_000) : null,
  });
  return { id };
}

/** Бросить неоконченный пробник (без баллов). */
export async function abandonMock(user: User, id: string): Promise<boolean> {
  const m = await getMockAttempt(id, user.id);
  if (!m || m.finishedAt) return false;
  await db.delete(schema.mockAttempts).where(eq(schema.mockAttempts.id, id));
  return true;
}

// ---------------- Автосохранение ----------------

export interface MockProgressPatch {
  answers?: Record<string, unknown>;
  flags?: unknown;
  timeSpent?: Record<string, unknown>;
}

export async function saveMockProgress(
  user: User,
  id: string,
  patch: MockProgressPatch
): Promise<{ ok: true } | { error: string }> {
  const m = await getMockAttempt(id, user.id);
  if (!m) return { error: "Пробник не найден" };
  if (m.finishedAt) return { error: "Пробник уже сдан" };
  if (isMockExpired(m, Date.now(), SAVE_GRACE_MS)) return { error: "Время вышло" };

  const slotById = new Map(m.items.map((it) => [it.problemId, it.n]));
  const answers = { ...m.answers };
  if (patch.answers && typeof patch.answers === "object") {
    for (const [pid, raw] of Object.entries(patch.answers)) {
      const n = slotById.get(pid);
      if (n == null || typeof raw !== "string") continue;
      const v = isPart1(n) ? normalizeBlankAnswer(raw).slice(0, PART1_ANSWER_MAX) : raw.slice(0, PART2_TEXT_MAX);
      if (v.trim()) answers[pid] = v;
      else delete answers[pid];
    }
  }
  let flags = m.flags;
  if (Array.isArray(patch.flags)) {
    flags = [...new Set(patch.flags.filter((f): f is string => typeof f === "string" && slotById.has(f)))];
  }
  const timeSpent = { ...m.timeSpent };
  if (patch.timeSpent && typeof patch.timeSpent === "object") {
    for (const [pid, raw] of Object.entries(patch.timeSpent)) {
      if (!slotById.has(pid) || typeof raw !== "number" || !Number.isFinite(raw)) continue;
      // Клиент шлёт накопленное время — берём максимум, чтобы запоздавший
      // запрос не откатил счётчик назад.
      timeSpent[pid] = Math.min(TASK_SECONDS_MAX, Math.max(timeSpent[pid] ?? 0, Math.round(raw)));
    }
  }
  await db.update(schema.mockAttempts).set({ answers, flags, timeSpent }).where(eq(schema.mockAttempts.id, id));
  return { ok: true };
}

export async function saveMockPhoto(
  user: User,
  id: string,
  problemId: string,
  image: string | null
): Promise<{ ok: true } | { error: string }> {
  const m = await getMockAttempt(id, user.id);
  if (!m) return { error: "Пробник не найден" };
  if (m.finishedAt) return { error: "Пробник уже сдан" };
  // Фото решений можно доснять и после конца отсчёта — на экзамене решение уже
  // на бумаге, а сфотографировать его — техническая часть. Даём 30 минут.
  if (isMockExpired(m, Date.now(), 30 * 60_000)) return { error: "Время на загрузку фото вышло" };
  const item = m.items.find((it) => it.problemId === problemId);
  if (!item || isPart1(item.n)) return { error: "Фото прикладывают только ко второй части" };
  if (image === null) {
    await db
      .delete(schema.mockImages)
      .where(and(eq(schema.mockImages.mockAttemptId, id), eq(schema.mockImages.problemId, problemId)));
    return { ok: true };
  }
  const img = cleanImageDataUrl(image);
  if (!img) return { error: "Фото не подошло — попробуй другое" };
  await db
    .insert(schema.mockImages)
    .values({ mockAttemptId: id, problemId, data: img })
    .onConflictDoUpdate({
      target: [schema.mockImages.mockAttemptId, schema.mockImages.problemId],
      set: { data: img, createdAt: new Date() },
    });
  return { ok: true };
}

// ---------------- Сдача ----------------

export async function finishMock(user: User, id: string): Promise<{ ok: true } | { error: string }> {
  const m = await getMockAttempt(id, user.id);
  if (!m) return { error: "Пробник не найден" };
  if (m.finishedAt) return { ok: true };

  const problems = new Map(
    (await Promise.all(m.items.map((it) => getProblem(it.problemId)))).filter((p): p is NonNullable<typeof p> => !!p).map((p) => [p.id, p])
  );
  const images = await getMockImages(id);
  const teacherId = user.teacherId ?? null;

  const part1Correct: Record<string, boolean> = {};
  const part2Attempts: Record<string, string> = {};
  let sentToTeacher = 0;

  await db.transaction(async (tx) => {
    // Защита от двойной сдачи: помечаем сданным одной условной операцией.
    const claimed = await tx
      .update(schema.mockAttempts)
      .set({ finishedAt: new Date() })
      .where(and(eq(schema.mockAttempts.id, id), isNull(schema.mockAttempts.finishedAt)))
      .returning({ id: schema.mockAttempts.id });
    if (claimed.length === 0) return;

    for (const it of m.items) {
      const problem = problems.get(it.problemId);
      if (!problem) continue;
      const answer = (m.answers[it.problemId] ?? "").trim();
      if (isPart1(it.n)) {
        const ok = !!answer && answersMatch(answer, problem.correctAnswer);
        part1Correct[it.problemId] = ok;
        // Ответы идут в общую историю: неверные попадут в «Мои ошибки».
        if (answer) {
          await tx.insert(schema.attempts).values({
            id: genId("a"),
            studentId: user.id,
            problemId: it.problemId,
            answer,
            isCorrect: ok,
            source: "mock",
          });
        }
        continue;
      }
      const img = images[it.problemId] ?? null;
      if (!answer && !img) continue;
      const attemptId = genId("a");
      await tx.insert(schema.attempts).values({
        id: attemptId,
        studentId: user.id,
        problemId: it.problemId,
        answer: answer || "(решение на фото)",
        // С репетитором — в очередь проверки; без него — самопроверка по критериям.
        isCorrect: !teacherId,
        source: "mock",
        reviewStatus: teacherId ? "pending" : "self_checked",
      });
      if (img) await tx.insert(schema.attemptImages).values({ attemptId, data: img });
      part2Attempts[it.problemId] = attemptId;
      if (teacherId) sentToTeacher++;
    }

    await tx
      .update(schema.mockAttempts)
      .set({ part1Correct, part2Attempts })
      .where(eq(schema.mockAttempts.id, id));
    await tx.delete(schema.mockImages).where(eq(schema.mockImages.mockAttemptId, id));

    // Репетитор узнаёт о каждом сданном пробнике — и сразу видит итог первой части.
    if (teacherId) {
      const part1Total = m.items.filter((it) => isPart1(it.n)).length;
      const part1Ok = Object.values(part1Correct).filter(Boolean).length;
      const p2Text =
        sentToTeacher > 0
          ? ` ${sentToTeacher} ${sentToTeacher === 1 ? "решение" : sentToTeacher < 5 ? "решения" : "решений"} второй части ждут проверки.`
          : "";
      await pushNotification(tx, {
        userId: teacherId,
        type: sentToTeacher > 0 ? "review_pending" : "homework_completed",
        title: `${user.name} сдал(а) пробник, вариант ${m.variant}`,
        body: `Часть 1: ${part1Ok} из ${part1Total}.${p2Text}`,
        link: `/teacher/student/${user.id}/mock/${id}`,
      });
    }
  });

  await recomputeMock(id);
  return { ok: true };
}

// ---------------- Самопроверка и пересчёт ----------------

export async function setMockSelfScore(
  user: User,
  id: string,
  problemId: string,
  score: number | null
): Promise<{ ok: true } | { error: string }> {
  const m = await getMockAttempt(id, user.id);
  if (!m || !m.finishedAt) return { error: "Пробник не найден" };
  if (user.teacherId) return { error: "Вторую часть проверяет репетитор" };
  const item = m.items.find((it) => it.problemId === problemId);
  if (!item || isPart1(item.n)) return { error: "Некорректное задание" };
  const max = maxPointsForSlot(item.n);
  const selfScores = { ...m.selfScores };
  if (score === null) delete selfScores[problemId];
  else if (Number.isInteger(score) && score >= 0 && score <= max) selfScores[problemId] = score;
  else return { error: `Баллы — от 0 до ${max}` };
  await db.update(schema.mockAttempts).set({ selfScores }).where(eq(schema.mockAttempts.id, id));
  await recomputeMock(id);
  return { ok: true };
}

export interface Part2State {
  problemId: string;
  n: number;
  max: number;
  /** null — балл ещё неизвестен (ждёт проверки или самопроверки) */
  score: number | null;
  status: "pending" | "reviewed" | "self" | "unscored" | "empty";
  attemptId?: string;
  feedback?: string | null;
  hasImage?: boolean;
}

/** Состояние каждого задания второй части по текущим проверкам. */
export async function part2States(m: MockAttemptRow, studentHasTeacher: boolean): Promise<Part2State[]> {
  const items = m.items.filter((it) => !isPart1(it.n));
  const attemptIds = Object.values(m.part2Attempts);
  const attempts = attemptIds.length
    ? await db.select().from(schema.attempts).where(inArray(schema.attempts.id, attemptIds))
    : [];
  const imgRows = attemptIds.length
    ? await db
        .select({ id: schema.attemptImages.attemptId })
        .from(schema.attemptImages)
        .where(inArray(schema.attemptImages.attemptId, attemptIds))
    : [];
  const withImage = new Set(imgRows.map((r) => r.id));
  const byId = new Map(attempts.map((a) => [a.id, a]));

  return items.map((it) => {
    const max = maxPointsForSlot(it.n);
    const aid = m.part2Attempts[it.problemId];
    const a = aid ? byId.get(aid) : undefined;
    const base = { problemId: it.problemId, n: it.n, max, attemptId: aid, hasImage: aid ? withImage.has(aid) : false };
    // Ученик без репетитора оценивает себя сам — в том числе задания,
    // которые решил на бумаге, но не сфотографировал.
    if (!studentHasTeacher || a?.reviewStatus === "self_checked") {
      const s = m.selfScores[it.problemId];
      return { ...base, score: s ?? null, status: s == null ? "unscored" : "self" } as Part2State;
    }
    if (!a) return { ...base, score: 0, status: "empty" } as Part2State;
    if (a.reviewStatus === "pending") return { ...base, score: null, status: "pending", feedback: null } as Part2State;
    const score = a.reviewScore ?? (a.reviewStatus === "approved" ? max : 0);
    return { ...base, score, status: "reviewed", feedback: a.teacherFeedback } as Part2State;
  });
}

/** Пересчитать баллы пробника (после сдачи, самопроверки, проверки репетитором). */
export async function recomputeMock(id: string): Promise<void> {
  const m = await getMockAttemptById(id);
  if (!m || !m.finishedAt) return;
  const userRows = await db
    .select({ teacherId: schema.users.teacherId, name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, m.studentId))
    .limit(1);
  const teacherId = userRows[0]?.teacherId ?? null;
  const part1 = Object.values(m.part1Correct ?? {}).filter(Boolean).length;
  const p2 = await part2States(m, !!teacherId);
  const part2 = p2.reduce((s, x) => s + (x.score ?? 0), 0);
  const pending = p2.filter((x) => x.status === "pending").length;
  const primary = part1 + part2;
  const test = primaryToTest(primary);
  await db
    .update(schema.mockAttempts)
    .set({ primaryScore: primary, testScore: test, part2Pending: pending })
    .where(eq(schema.mockAttempts.id, id));

  // Ученик репетитора: полный пробник, проверенный целиком, попадает в
  // «Цель и пробники» — его видят репетитор и родитель, как записанный вручную.
  if (teacherId && pending === 0 && m.mode !== "part1") {
    const takenAt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(new Date(m.finishedAt));
    await db
      .insert(schema.mockScores)
      .values({
        id: `mks_${m.id}`,
        teacherId,
        studentId: m.studentId,
        score: test,
        takenAt,
        note: `Пробник на платформе, вариант ${m.variant}`,
      })
      .onConflictDoUpdate({ target: schema.mockScores.id, set: { score: test } });
  }
}

/** Репетитор проверил решение: если оно из пробника — пересчитать пробник. */
export async function onAttemptReviewed(attemptId: string): Promise<string | null> {
  const rows = await db.execute(sql`
    select id from mock_attempts
    where exists (select 1 from jsonb_each_text(part2_attempts) e where e.value = ${attemptId})
    limit 1`);
  const mockId = (rows.rows[0] as { id: string } | undefined)?.id ?? null;
  if (mockId) await recomputeMock(mockId);
  return mockId;
}
