// План до экзамена: сколько уроков (навыков) осталось и сколько нужно в день.
//
// Дата ЕГЭ по математике — ОРИЕНТИРОВОЧНАЯ: официальное расписание на 2027 год
// ещё не опубликовано (обычно Рособрнадзор утверждает его зимой). Профильная
// математика последние годы проходит в конце мая — начале июня. Когда
// расписание выйдет, поменять здесь одну строку — и обновится везде.
export const EXAM_DATE = "2027-06-01";
export const EXAM_DATE_IS_ESTIMATE = true;
/** Тариф «До ЕГЭ» действует до этого дня включительно: основные и резервные
 * дни, пересдачи. После сезона — сдвинуть на следующий год вместе с EXAM_DATE. */
export const EXAM_ACCESS_UNTIL = "2027-07-15";
/** Сколько дней в неделю закладываем на занятия (выходные — запас). */
const STUDY_DAYS_PER_WEEK = 5;

export interface ExamPlan {
  daysLeft: number;
  remainingSkills: number;
  totalSkills: number;
  perWeek: number;
  /** уроков в учебный день (дробное → показываем как «1–2») */
  perDay: number;
}

export function computeExamPlan(
  progress: Record<string, { solved: number; total: number }>,
  now: Date = new Date()
): ExamPlan {
  const skills = Object.values(progress).filter((p) => p.total > 0);
  const remaining = skills.filter((p) => p.solved < p.total).length;
  const exam = new Date(`${EXAM_DATE}T09:00:00+03:00`);
  const daysLeft = Math.max(0, Math.ceil((exam.getTime() - now.getTime()) / 86400000));
  const weeks = Math.max(1, daysLeft / 7);
  const perWeek = remaining / weeks;
  return {
    daysLeft,
    remainingSkills: remaining,
    totalSkills: skills.length,
    perWeek: Math.ceil(perWeek),
    perDay: perWeek / STUDY_DAYS_PER_WEEK,
  };
}

/** «1 урок», «1–2 урока», «2 урока» в учебный день. */
export function perDayLabel(perDay: number): string {
  if (perDay <= 0) return "повторение пройденного";
  const lo = Math.max(1, Math.floor(perDay));
  const hi = Math.ceil(perDay);
  const word = (n: number) => (n === 1 ? "урок" : n < 5 ? "урока" : "уроков");
  return lo === hi || perDay < 1 ? `${lo} ${word(lo)}` : `${lo}–${hi} ${word(hi)}`;
}
