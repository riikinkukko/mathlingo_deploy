/**
 * Максимальные баллы за задания второй части ЕГЭ по профильной математике
 * (нумерация ЕГЭ-2027, как в problems.ege_task_number — см. toEge2027Numbers
 * в scripts/seed.ts). Репетитор при проверке развёрнутого решения ставит
 * 0..макс. баллов по критериям ФИПИ.
 *
 *   №14 — 2  (уравнение)
 *   №15 — 3  (стереометрия)
 *   №16 — 2  (неравенство)
 *   №17 — 2  (моделирование реальной ситуации)
 *   №18 — 3  (планиметрия)
 *   №19 — 4  (параметр)
 *   №20 — 4  (числа и их свойства)
 *
 * №1–13 — краткий ответ, по 1 баллу (экономическая задача в ЕГЭ-2027 стала
 * №13 с кратким ответом). Итого 13 + 20 = 33 первичных балла (проект ФИПИ).
 *
 * Если ФИПИ поменяет шкалу — правится только эта таблица. Для задач без
 * номера (свои задачи репетитора) или с неизвестным номером — 2 балла.
 * Модуль без зависимостей: импортируется и на клиенте (карточка проверки).
 */
export const EGE_2027_MAX_POINTS: Readonly<Record<number, number>> = {
  14: 2,
  15: 3,
  16: 2,
  17: 2,
  18: 3,
  19: 4,
  20: 4,
};

export const DEFAULT_MAX_POINTS = 2;

/** Максимум баллов за задание с этим номером ЕГЭ-2027. */
export function maxPointsForTask(egeTaskNumber: number | null | undefined): number {
  if (egeTaskNumber == null) return DEFAULT_MAX_POINTS;
  return EGE_2027_MAX_POINTS[egeTaskNumber] ?? DEFAULT_MAX_POINTS;
}

/**
 * Проверяет баллы с клиента. null/undefined — баллы не ставили (так можно).
 * Возвращает { ok, score } или { ok: false } для мусора и выхода за 0..max.
 */
export function parseReviewScore(raw: unknown, max: number): { ok: true; score: number | null } | { ok: false } {
  if (raw === null || raw === undefined || raw === "") return { ok: true, score: null };
  const n = typeof raw === "number" ? raw : typeof raw === "string" && /^\d+$/.test(raw.trim()) ? Number(raw) : NaN;
  if (!Number.isInteger(n) || n < 0 || n > max) return { ok: false };
  return { ok: true, score: n };
}

export type ReviewDecision = "approved" | "needs_revision";

/**
 * Какое решение предлагать по баллам. Полный балл — всегда «одобрено»
 * (на доработку его не отправить); 0 или частичный — по умолчанию «доработать»:
 * на экзамене это неполное решение. Без баллов — подсказки нет.
 */
export function defaultDecisionForScore(score: number | null, max: number): ReviewDecision | null {
  if (score === null) return null;
  return score >= max ? "approved" : "needs_revision";
}

/** Окончательное решение: полный балл принудительно превращается в «одобрено». */
export function resolveDecision(decision: ReviewDecision, score: number | null, max: number): ReviewDecision {
  return score !== null && score >= max ? "approved" : decision;
}

/** «2 из 3 баллов» — для ученика, родителя и карточки репетитора. */
export function scoreLabel(score: number, max: number): string {
  return `${score} из ${max} ${max === 1 ? "балла" : "баллов"}`;
}
