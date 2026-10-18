/**
 * Пробник ЕГЭ по профильной математике — чистая логика без базы и React:
 * формат экзамена, режимы, сборка варианта из банка задач, проверка формата
 * ответа для бланка, перевод первичных баллов в тестовые.
 *
 * Формат — по проекту демоверсии ФИПИ-2027: 20 заданий, №1–13 с кратким
 * ответом (по 1 баллу), №14–20 с развёрнутым решением (баллы — lib/ege-points.ts),
 * максимум 33 первичных балла, 3 часа 55 минут.
 *
 * Модуль импортируется и на клиенте (экран пробника), и на сервере.
 */
import { maxPointsForTask } from "./ege-points";

export const MOCK_TASKS = 20;
/** Последний номер первой части (краткий ответ). */
export const PART1_LAST = 13;
export const PART1_POINTS = PART1_LAST; // по 1 баллу
export const MAX_PRIMARY = 33;
export const EXAM_MINUTES = 235;

/** Сколько вариантов показываем в списке. */
export const MOCK_VARIANT_COUNT = 20;
/** Варианты, открытые без Pro (самостоятельным ученикам на Free). */
export const FREE_VARIANTS: readonly number[] = [1];

export type MockMode = "full" | "part1" | "free";

export const MOCK_MODES: Record<MockMode, { title: string; hint: string; minutes: number | null; part2: boolean }> = {
  full: {
    title: "Как на экзамене",
    hint: "Все 20 заданий, 3 часа 55 минут. Ответы и разбор — после сдачи.",
    minutes: EXAM_MINUTES,
    part2: true,
  },
  part1: {
    title: "Только первая часть",
    hint: "Задания 1–13 с кратким ответом, 1 час 30 минут. Удобно, когда мало времени.",
    minutes: 90,
    part2: false,
  },
  free: {
    title: "Без таймера",
    hint: "Все 20 заданий в своём темпе. Время на каждое задание всё равно посчитаем.",
    minutes: null,
    part2: true,
  },
};

export function isMockMode(v: unknown): v is MockMode {
  return v === "full" || v === "part1" || v === "free";
}

export function isPart1(egeNumber: number): boolean {
  return egeNumber >= 1 && egeNumber <= PART1_LAST;
}

// ---------------- Бланк ответов ----------------

const BLANK_RE = /^-?\d+([.,]\d+)?$/;

/** Можно ли такой ответ записать в бланк ЕГЭ: целое или десятичная дробь. */
export function isBlankAnswer(answer: string): boolean {
  return BLANK_RE.test(answer.trim());
}

/**
 * Подсказка о формате ответа первой части — как требования к бланку №1.
 * null — ответ пустой или записан правильно.
 */
export function blankAnswerProblem(raw: string): string | null {
  const a = raw.trim();
  if (!a || isBlankAnswer(a)) return null;
  if (a.includes("/")) return "Обыкновенную дробь в бланк не записать — переведи в десятичную.";
  if (/\s/.test(a)) return "Без пробелов: в бланке каждая цифра в своей клеточке.";
  if (/[a-zа-яё°%²³]/i.test(a)) return "Только число — без единиц измерения и букв.";
  if (/^[-+]?[.,]\d/.test(a)) return "Перед запятой нужен ноль: 0,5, а не ,5.";
  if (/[.,]$/.test(a)) return "Ответ не может заканчиваться запятой.";
  return "В бланк записывают только целое число или десятичную дробь.";
}

/** Ответ к сохранению: убираем лишние пробелы, точку меняем на запятую. */
export function normalizeBlankAnswer(raw: string): string {
  return raw.trim().replace(/\s+/g, "").replace(".", ",").slice(0, 20);
}

// ---------------- Сборка варианта ----------------

export interface PoolProblem {
  id: string;
  egeTaskNumber: number | null | undefined;
  answerType: string;
  correctAnswer: string;
  skillId?: string | null;
}

/** Подходит ли задача банка для пробника и под какой номер. */
export function mockSlotFor(p: PoolProblem): number | null {
  const n = p.egeTaskNumber;
  if (n == null || !p.skillId || n < 1 || n > MOCK_TASKS) return null;
  if (isPart1(n)) return p.answerType === "NUMBER" && isBlankAnswer(p.correctAnswer) ? n : null;
  return p.answerType === "DETAILED" ? n : null;
}

/** Пулы задач по номерам, отсортированные по id (стабильно между запусками). */
export function buildPools(problems: PoolProblem[]): Map<number, string[]> {
  const pools = new Map<number, string[]>();
  for (const p of problems) {
    const n = mockSlotFor(p);
    if (n == null) continue;
    if (!pools.has(n)) pools.set(n, []);
    pools.get(n)!.push(p.id);
  }
  for (const ids of pools.values()) ids.sort();
  return pools;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Задачи варианта по порядку номеров. Для каждого номера пул один раз
 * перемешивается (сид — номер задания), вариант k берёт k-й элемент: соседние
 * варианты не повторяют задачи, пока пул не кончится. Номера без задач в
 * банке пропускаются. part2=false — только первая часть.
 */
export function buildVariant(pools: Map<number, string[]>, variant: number, part2 = true): { n: number; problemId: string }[] {
  const out: { n: number; problemId: string }[] = [];
  const last = part2 ? MOCK_TASKS : PART1_LAST;
  for (let n = 1; n <= last; n++) {
    const pool = pools.get(n);
    if (!pool || pool.length === 0) continue;
    const order = [...pool];
    const rnd = mulberry32(n * 7919 + 104729);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    out.push({ n, problemId: order[(Math.max(1, variant) - 1) % order.length] });
  }
  return out;
}

// ---------------- Баллы ----------------

/**
 * Официальная шкала перевода 2026 года (максимум 32 первичных балла).
 * Шкалу ЕГЭ-2027 (33 балла) Рособрнадзор опубликует ближе к экзамену —
 * до тех пор пересчитываем пропорционально и честно пишем «ориентировочно».
 */
const SCALE_2026: readonly number[] = [
  0, 5, 9, 14, 18, 23, 27, 33, 39, 45, 50, 56, 62, 68, 70, 72, 74, 76, 78, 80, 82, 84, 86, 88, 90, 92, 94, 96, 98, 99, 100, 100, 100,
];
export const SCALE_IS_ESTIMATE = true;
/** Минимальный тестовый балл профильной математики (для аттестата). */
export const PASS_TEST_SCORE = 27;

export function primaryToTest(primary: number): number {
  if (primary <= 0) return 0;
  const p = Math.min(32, Math.round((Math.min(primary, MAX_PRIMARY) * 32) / MAX_PRIMARY));
  return SCALE_2026[Math.max(1, p)];
}

export function maxPointsForSlot(n: number): number {
  return isPart1(n) ? 1 : maxPointsForTask(n);
}

/** Максимум первичных баллов для набора номеров (вариант без каких-то номеров). */
export function maxPrimaryFor(numbers: number[]): number {
  return numbers.reduce((s, n) => s + maxPointsForSlot(n), 0);
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/** «12 мин», «1 ч 05 мин», «40 с» — для времени на задание в разборе. */
export function humanDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s} с`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} мин`;
  return `${Math.floor(m / 60)} ч ${String(m % 60).padStart(2, "0")} мин`;
}
