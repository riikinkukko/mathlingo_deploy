import { FREE_MAX_ENERGY } from "./queries";

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

export function getTeacherProPrice() {
  return {
    priceRub: Number(process.env.YOOKASSA_TEACHER_PRICE_RUB || 1499),
    periodDays: Number(process.env.YOOKASSA_TEACHER_PERIOD_DAYS || 30),
  };
}

export const TEACHER_FREE_STUDENT_LIMIT = 3;

export const STUDENT_FREE_FEATURES = [
  `${FREE_MAX_ENERGY} энергии в день (восстанавливается со временем)`,
  "Глава «Треугольники» полностью открыта",
  "Обычные задачи с подсказками и разбором",
];

export const STUDENT_PRO_FEATURES = [
  "Бесконечная энергия — решай сколько угодно задач в день",
  "Все главы программы, а не только «Треугольники»",
  "Развёрнутые (DETAILED) задачи с эталонным решением для самопроверки",
  "Авторские пробники платформы",
  "Подробная аналитика по темам (в разработке)",
];

export const TEACHER_FREE_FEATURES = [
  `До ${TEACHER_FREE_STUDENT_LIMIT} учеников`,
  "Весь функционал платформы без ограничений",
];

export const TEACHER_PRO_FEATURES = ["Неограниченное число учеников", "Весь функционал платформы без ограничений"];
