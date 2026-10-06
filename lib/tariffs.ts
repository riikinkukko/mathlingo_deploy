import { FREE_MAX_ENERGY } from "./queries";
import { EXAM_ACCESS_UNTIL } from "./exam-plan";

/**
 * Единый источник тарифов: публичная страница /tariffs (её требует ЮKassa —
 * цены должны быть видны без входа в аккаунт) и страницы оформления в
 * кабинетах берут цены и описания отсюда, чтобы они не разъезжались.
 * Цены — из переменных окружения (те же, что использует платёжный код).
 */

export function getStudentProPrice() {
  return {
    priceRub: Number(process.env.YOOKASSA_PRICE_RUB || 249),
    periodDays: Number(process.env.YOOKASSA_PERIOD_DAYS || 30),
  };
}

const ruDate = (d: Date) =>
  d.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "long", year: "numeric" }).replace(/\s?г\.$/, "");

/**
 * «До ЕГЭ» — разовая оплата Pro до конца экзаменационного сезона. Продаём,
 * только пока до конца сезона больше месяца (летом — ждём новый сезон).
 *
 * Ранняя цена: до даты YOOKASSA_EXAM_EARLY_UNTIL действует сниженная цена, и
 * обычная показывается зачёркнутой. После этой даты цена сама становится
 * обычной — так зачёркнутая цена честная, а не придуманная «скидка».
 */
export function getStudentExamPass(now: Date = new Date()) {
  const until = new Date(`${EXAM_ACCESS_UNTIL}T23:59:59+03:00`);
  const regularPriceRub = Number(process.env.YOOKASSA_EXAM_PRICE_RUB || 1490);
  const earlyPrice = Number(process.env.YOOKASSA_EXAM_EARLY_PRICE_RUB || 1190);
  const earlyUntilRaw = process.env.YOOKASSA_EXAM_EARLY_UNTIL || "2026-12-31";
  const earlyUntil = /^\d{4}-\d{2}-\d{2}$/.test(earlyUntilRaw) ? new Date(`${earlyUntilRaw}T23:59:59+03:00`) : null;
  const early = !!earlyUntil && now.getTime() <= earlyUntil.getTime() && earlyPrice > 0 && earlyPrice < regularPriceRub;
  const priceRub = early ? earlyPrice : regularPriceRub;
  const daysLeft = Math.ceil((until.getTime() - now.getTime()) / 86_400_000);
  const months = Math.max(1, Math.round(daysLeft / 30));
  return {
    priceRub,
    /** обычная цена — показывается зачёркнутой, пока действует ранняя */
    regularPriceRub: early ? regularPriceRub : null,
    earlyUntilLabel: early ? ruDate(earlyUntil!) : null,
    until,
    daysLeft,
    available: daysLeft > 30,
    /** во что обходится месяц (для сравнения с помесячной оплатой) */
    perMonth: Math.round(priceRub / months),
    untilLabel: ruDate(until),
  };
}

export const TEACHER_FREE_STUDENT_LIMIT = 3;

export const STUDENT_FREE_FEATURES = [
  `До ${FREE_MAX_ENERGY} новых задач за раз — энергия восстанавливается по 1 каждые 30 минут`,
  "Первая глава каждой темы полностью и первый урок остальных глав",
  "Обычные задачи с подсказками и разбором",
];

export const STUDENT_PRO_FEATURES = [
  "Бесконечная энергия — решай сколько угодно задач в день",
  "Все главы программы, а не только первые",
  "Задачи второй части с эталонным решением для самопроверки",
  "Авторские пробники платформы",
  "Проверка решения экспертом по критериям ЕГЭ — по запросу, отдельно",
];

// Тарифы репетитора (ступени, цены, пробный период) — в lib/teacher-plan.ts.
