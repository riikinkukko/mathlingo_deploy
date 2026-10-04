// Тарифы репетитора: ступени по числу учеников, месяц или год, пробный период.
// Чистые функции без базы — работают и на сервере, и в браузере, и в тестах.
import type { User } from "./types";

export type TeacherTier = "standard" | "pro";
export type BillingPeriod = "month" | "year";

export const TEACHER_FREE_LIMIT = 3;
export const TEACHER_TRIAL_DAYS = 14;

export const TEACHER_TIERS: Record<
  TeacherTier,
  { name: string; limit: number; month: number; year: number; blurb: string }
> = {
  standard: { name: "Репетитор", limit: 15, month: 690, year: 6900, blurb: "до 15 учеников" },
  pro: { name: "Профи", limit: Infinity, month: 1290, year: 12900, blurb: "без лимита учеников" },
};

export function periodDays(period: BillingPeriod): number {
  return period === "year" ? 365 : 30;
}

export function tierPrice(tier: TeacherTier, period: BillingPeriod): number {
  return TEACHER_TIERS[tier][period];
}

export function isTeacherTier(v: unknown): v is TeacherTier {
  return v === "standard" || v === "pro";
}
export function isBillingPeriod(v: unknown): v is BillingPeriod {
  return v === "month" || v === "year";
}

export interface TeacherPlanState {
  /** что действует сейчас */
  tier: "free" | TeacherTier;
  source: "owner" | "paid" | "trial" | "free";
  /** сколько учеников можно (Infinity — без лимита) */
  limit: number;
  /** до какого момента действует оплата или пробный период */
  until: Date | null;
  /** дней до окончания пробного периода (если идёт) */
  trialDaysLeft: number | null;
  /** оплаченный тариф (для продления), даже если сейчас идёт пробный */
  paidTier: TeacherTier | null;
}

/** Активна ли ОПЛАТА тарифа (без учёта пробного периода). */
export function isTeacherPaidActive(u: Pick<User, "teacherPlan" | "teacherProUntil">, now = Date.now()): boolean {
  if (u.teacherPlan !== "pro") return false;
  if (!u.teacherProUntil) return true; // выдано вручную бессрочно
  return new Date(u.teacherProUntil).getTime() > now;
}

export function teacherPlanState(
  u: Pick<User, "teacherPlan" | "teacherProUntil" | "teacherTier" | "teacherTrialUntil" | "isPlatformOwner">,
  now = Date.now()
): TeacherPlanState {
  const paidTier: TeacherTier | null = isTeacherPaidActive(u, now) ? (u.teacherTier ?? "pro") : null;
  const trialUntil = u.teacherTrialUntil ? new Date(u.teacherTrialUntil) : null;
  const trialActive = !!trialUntil && trialUntil.getTime() > now;
  if (u.isPlatformOwner) {
    return { tier: "pro", source: "owner", limit: Infinity, until: null, trialDaysLeft: null, paidTier };
  }
  // Оплаченный «Профи» сильнее пробного; оплаченный «Репетитор» во время
  // пробного не урезает: пока идёт пробный, действует «Профи».
  if (paidTier === "pro" || (paidTier && !trialActive)) {
    return {
      tier: paidTier,
      source: "paid",
      limit: TEACHER_TIERS[paidTier].limit,
      until: u.teacherProUntil ? new Date(u.teacherProUntil) : null,
      trialDaysLeft: null,
      paidTier,
    };
  }
  if (trialActive) {
    return {
      tier: "pro",
      source: "trial",
      limit: Infinity,
      until: trialUntil,
      trialDaysLeft: Math.max(1, Math.ceil((trialUntil!.getTime() - now) / 86_400_000)),
      paidTier,
    };
  }
  return { tier: "free", source: "free", limit: TEACHER_FREE_LIMIT, until: null, trialDaysLeft: null, paidTier: null };
}

/**
 * Сколько дней нового тарифа дать при смене тарифа посреди оплаченного
 * периода: неиспользованный остаток старого переводится по цене за день.
 * Пример: осталось 15 дней «Репетитора» (690/30 ₽ в день) при переходе на
 * «Профи» (1290/30 ₽ в день) → +8 дней «Профи» к купленным.
 */
export function convertRemainingDays(
  remainingMs: number,
  from: { tier: TeacherTier; period: BillingPeriod },
  to: { tier: TeacherTier; period: BillingPeriod }
): number {
  if (remainingMs <= 0) return 0;
  const fromDaily = tierPrice(from.tier, from.period) / periodDays(from.period);
  const toDaily = tierPrice(to.tier, to.period) / periodDays(to.period);
  return Math.floor(((remainingMs / 86_400_000) * fromDaily) / toDaily);
}

export function formatRubPlain(n: number): string {
  return `${n.toLocaleString("ru-RU")} ₽`;
}
