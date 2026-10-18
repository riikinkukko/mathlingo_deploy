// Правила начисления бонуса «Пригласи коллегу» (чистая логика, без БД).
// Минимальная защита от самоприглашения (второй аккаунт по своей же ссылке):
//  • приглашённый должен подтвердить email — одноразовые/выдуманные адреса
//    отсекаются, а каждый второй аккаунт требует реального ящика;
//  • если известна карта обоих (маска ЮKassa: тип + последние 4 цифры), она
//    должна отличаться — оплата «коллеги» своей же картой бонуса не даёт;
//  • не больше REFERRAL_MAX_REWARDS_PER_YEAR бонусов одному пригласившему за
//    последние 12 месяцев — даже при обходе проверок выгода ограничена.

export const REFERRAL_MAX_REWARDS_PER_YEAR = 6;

export interface CardMask {
  last4?: string | null;
  type?: string | null;
}

export interface ReferralCheckInput {
  inviteeEmailVerified: boolean;
  inviteeCard?: CardMask | null;
  inviterCard?: CardMask | null;
  /** Сколько бонусов пригласивший уже получил за последние 12 месяцев. */
  inviterRewardsLastYear: number;
}

export type ReferralDecision =
  | { ok: true }
  | { ok: false; reason: "email_not_verified" | "same_card" | "limit_reached" };

/** Одна и та же карта: совпали последние 4 цифры и (если известен у обоих) тип. */
export function sameCard(a?: CardMask | null, b?: CardMask | null): boolean {
  if (!a?.last4 || !b?.last4) return false;
  if (a.last4 !== b.last4) return false;
  if (a.type && b.type && a.type.toLowerCase() !== b.type.toLowerCase()) return false;
  return true;
}

export function referralRewardDecision(i: ReferralCheckInput): ReferralDecision {
  if (!i.inviteeEmailVerified) return { ok: false, reason: "email_not_verified" };
  if (sameCard(i.inviteeCard, i.inviterCard)) return { ok: false, reason: "same_card" };
  if (i.inviterRewardsLastYear >= REFERRAL_MAX_REWARDS_PER_YEAR) return { ok: false, reason: "limit_reached" };
  return { ok: true };
}
