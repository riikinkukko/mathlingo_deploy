/** Формат бланка и времени для пробника — те же правила, что lib/mock-exam.ts сайта. */
export const PART1_LAST = 13;

export function isPart1(n: number): boolean {
  return n >= 1 && n <= PART1_LAST;
}

const BLANK_RE = /^-?\d+([.,]\d+)?$/;

export function blankAnswerProblem(raw: string): string | null {
  const a = raw.trim();
  if (!a || BLANK_RE.test(a)) return null;
  if (a.includes("/")) return "Обыкновенную дробь в бланк не записать — переведи в десятичную.";
  if (/\s/.test(a)) return "Без пробелов: в бланке каждая цифра в своей клеточке.";
  if (/[a-zа-яё°%²³]/i.test(a)) return "Только число — без единиц измерения и букв.";
  if (/^[-+]?[.,]\d/.test(a)) return "Перед запятой нужен ноль: 0,5, а не ,5.";
  if (/[.,]$/.test(a)) return "Ответ не может заканчиваться запятой.";
  return "В бланк записывают только целое число или десятичную дробь.";
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function humanDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s} с`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} мин`;
  return `${Math.floor(m / 60)} ч ${String(m % 60).padStart(2, "0")} мин`;
}

export function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}
