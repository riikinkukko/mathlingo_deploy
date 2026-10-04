// Время занятия для интерфейса: «15:00–16:30» и «1 ч 30 мин» (по Москве).
// Чистые функции без зависимостей — работают и на сервере, и в браузере.
const MSK = "Europe/Moscow";

export function mskClock(d: Date | string): string {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: MSK, hour: "2-digit", minute: "2-digit" }).format(new Date(d));
}

/** «15:00–16:30» — начало и конец занятия. */
export function lessonTimeRange(startsAt: Date | string, durationMin: number): string {
  const start = new Date(startsAt);
  const end = new Date(start.getTime() + durationMin * 60000);
  return `${mskClock(start)}–${mskClock(end)}`;
}

/** «45 мин», «1 ч», «1 ч 30 мин», «2 ч». */
export function durationLabel(min: number): string {
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

/** Ключ дня по Москве: «2026-10-05». */
export function mskDayKey(d: Date | string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: MSK }).format(new Date(d));
}

/** Минуты от полуночи по Москве. */
export function mskMinutes(d: Date | string): number {
  const [h, m] = mskClock(d).split(":").map(Number);
  return h * 60 + m;
}

/** Понедельник недели (по Москве), в которую попадает день key. */
export function mondayOf(key: string): string {
  const d = new Date(`${key}T12:00:00Z`);
  const wd = (d.getUTCDay() + 6) % 7; // 0 — понедельник
  d.setUTCDate(d.getUTCDate() - wd);
  return d.toISOString().slice(0, 10);
}

export function addDaysKey(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Начало дня по Москве как Date. */
export function mskDayStart(key: string): Date {
  return new Date(`${key}T00:00:00+03:00`);
}

/** «Сегодня · 15:00–16:30», «Завтра · 15:00–16:30», «Чт, 8 октября · 15:00–16:30». */
export function lessonWhenLabel(startsAt: Date | string, durationMin: number, now: Date = new Date()): string {
  const key = mskDayKey(startsAt);
  const today = mskDayKey(now);
  const range = lessonTimeRange(startsAt, durationMin);
  if (key === today) return `Сегодня · ${range}`;
  if (key === addDaysKey(today, 1)) return `Завтра · ${range}`;
  const day = new Date(startsAt).toLocaleDateString("ru-RU", { timeZone: MSK, weekday: "short", day: "numeric", month: "long" });
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${range}`;
}

/** Срок сдачи «до конца дня key по Москве» (23:59). */
export function mskEndOfDay(key: string): Date {
  return new Date(`${key}T23:59:00+03:00`);
}
