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
