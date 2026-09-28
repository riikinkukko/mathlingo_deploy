// Форматирование для учёта оплат. Без зависимостей — годится и для серверных,
// и для клиентских компонентов.

/** 4500 → "4 500 ₽" (неразрывный пробел между разрядами, как в ru-RU). */
export function formatRub(n: number): string {
  return `${n.toLocaleString("ru-RU")} ₽`;
}

/** "2026-09-28" → "28 сентября" (или "28 сентября 2025", если год не текущий). */
export function formatDateRu(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  // Полдень UTC — чтобы никакой часовой пояс не сдвинул дату на соседний день.
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const sameYear = y === new Date().getUTCFullYear();
  return dt.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
}

/** Первый день текущего и следующего месяца по Москве: ["2026-09-01", "2026-10-01"]. */
export function currentMonthRangeMsk(offsetMonths = 0): [string, string] {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
  const start = new Date(Date.UTC(now.getFullYear(), now.getMonth() + offsetMonths, 1));
  const end = new Date(Date.UTC(now.getFullYear(), now.getMonth() + offsetMonths + 1, 1));
  const f = (d: Date) => d.toISOString().slice(0, 10);
  return [f(start), f(end)];
}

/** Название месяца в именительном падеже: "сентябрь". */
export function monthNameRu(offsetMonths = 0): string {
  const [start] = currentMonthRangeMsk(offsetMonths);
  const [y, m] = start.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("ru-RU", {
    month: "long",
    timeZone: "UTC",
  });
}
