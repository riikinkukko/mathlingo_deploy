// Промокоды и «Пригласи коллегу».
//
// Промокод бывает двух видов:
//   percent — скидка в % на ПЕРВУЮ оплату (продления — по полной цене);
//   days    — сразу +N дней: репетитору к оплаченному тарифу (или к пробному
//             «Профи», если не платит), самостоятельному ученику — к Pro.
// Каждый пользователь применяет конкретный код один раз (уникальный индекс).
//
// Приглашение: у репетитора есть личная ссылка /register/teacher?ref=КОД.
// Когда приглашённый впервые оплачивает тариф, обоим +30 дней.
import { and, eq, sql } from "drizzle-orm";
import { db } from "./db/client";
import * as schema from "./db/schema";
import { genId } from "./queries";
import type { User } from "./types";

export const REFERRAL_BONUS_DAYS = 30;
/** Кука с кодом-скидкой: введённый при регистрации или на странице тарифа код ждёт оплаты. */
export const PROMO_COOKIE = "pm_promo";
const DAY = 86_400_000;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;
export type PromoRow = typeof schema.promoCodes.$inferSelect;
export type PromoAudience = "teacher" | "student";

/** Код в нормальном виде: без пробелов, в верхнем регистре; null — мусор. */
export function normalizePromoCode(raw: unknown): string | null {
  const s = String(raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
  return /^[A-ZА-ЯЁ0-9_-]{3,32}$/.test(s) ? s : null;
}

export function promoAudienceOf(user: Pick<User, "role" | "teacherId">): PromoAudience | null {
  if (user.role === "TEACHER") return "teacher";
  if (user.role === "STUDENT" && !user.teacherId) return "student";
  return null;
}

/** Цена со скидкой: целые рубли, не меньше 1 ₽ (ЮKassa не принимает 0). */
export function discountedPrice(price: number, percent: number): number {
  return Math.max(1, Math.round((price * (100 - percent)) / 100));
}

/** Что даёт код — короткой фразой для экрана. */
export function promoLabel(p: Pick<PromoRow, "kind" | "value" | "audience">): string {
  const days = (n: number) => `${n} ${pluralDays(n)}`;
  if (p.kind === "percent") return `скидка ${p.value}% на первую оплату`;
  return p.audience === "teacher" ? `+${days(p.value)} тарифа` : `+${days(p.value)} Pro`;
}

function pluralDays(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m100 >= 11 && m100 <= 14) return "дней";
  if (m10 === 1) return "день";
  if (m10 >= 2 && m10 <= 4) return "дня";
  return "дней";
}

export type PromoCheck = { ok: true; promo: PromoRow; label: string } | { ok: false; error: string };

/** Проверка без применения: подходит ли код этому пользователю сейчас. */
export async function checkPromo(rawCode: unknown, user: User, now: Date = new Date()): Promise<PromoCheck> {
  const code = normalizePromoCode(rawCode);
  if (!code) return { ok: false, error: "Такого промокода нет" };
  const [promo] = await db.select().from(schema.promoCodes).where(eq(schema.promoCodes.code, code)).limit(1);
  if (!promo || !promo.active) return { ok: false, error: "Такого промокода нет" };
  if (promo.expiresAt && promo.expiresAt.getTime() <= now.getTime()) return { ok: false, error: "Срок действия промокода закончился" };
  if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) return { ok: false, error: "Промокод уже использовали максимальное число раз" };
  const audience = promoAudienceOf(user);
  if (audience !== promo.audience) {
    return { ok: false, error: promo.audience === "teacher" ? "Этот промокод — для репетиторов" : "Этот промокод — для учеников без репетитора" };
  }
  const [used] = await db
    .select({ id: schema.promoRedemptions.id })
    .from(schema.promoRedemptions)
    .where(and(eq(schema.promoRedemptions.code, code), eq(schema.promoRedemptions.userId, user.id)))
    .limit(1);
  if (used) return { ok: false, error: "Вы уже использовали этот промокод" };
  if (promo.kind === "percent") {
    const type = audience === "teacher" ? "teacher_pro" : "student_pro";
    const [paid] = await db
      .select({ id: schema.payments.id })
      .from(schema.payments)
      .where(and(eq(schema.payments.userId, user.id), eq(schema.payments.paymentType, type), eq(schema.payments.status, "succeeded")))
      .limit(1);
    if (paid) return { ok: false, error: "Скидка по промокоду действует только на первую оплату" };
  }
  return { ok: true, promo, label: promoLabel(promo) };
}

/** Занять одно использование кода и записать, кто применил. false — лимит или повтор. */
async function claimPromo(tx: Tx, code: string, userId: string, paymentId: string | null): Promise<boolean> {
  const inserted = await tx
    .insert(schema.promoRedemptions)
    .values({ id: genId("pr"), code, userId, paymentId })
    .onConflictDoNothing()
    .returning({ id: schema.promoRedemptions.id });
  if (inserted.length === 0) return false;
  await tx
    .update(schema.promoCodes)
    .set({ usedCount: sql`${schema.promoCodes.usedCount} + 1` })
    .where(eq(schema.promoCodes.code, code));
  return true;
}

/**
 * +N дней репетитору: к оплаченному тарифу, если он действует, иначе к
 * пробному «Профи» (начиная с сегодня или с конца текущего пробного).
 */
export async function extendTeacherDays(tx: Tx, userId: string, days: number, now: Date = new Date()): Promise<void> {
  const [u] = await tx.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!u) return;
  const add = days * DAY;
  const paidActive = u.teacherPlan === "pro" && (!u.teacherProUntil || u.teacherProUntil.getTime() > now.getTime());
  if (paidActive) {
    if (!u.teacherProUntil) return; // бессрочный — продлевать некуда
    await tx.update(schema.users).set({ teacherProUntil: new Date(u.teacherProUntil.getTime() + add) }).where(eq(schema.users.id, userId));
    return;
  }
  const from = Math.max(now.getTime(), u.teacherTrialUntil?.getTime() ?? 0);
  await tx
    .update(schema.users)
    .set({ teacherTrialUntil: new Date(from + add), teacherTrialReminded: null })
    .where(eq(schema.users.id, userId));
}

async function extendStudentDays(tx: Tx, userId: string, days: number, now: Date = new Date()): Promise<void> {
  const [u] = await tx.select({ proUntil: schema.users.proUntil }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!u) return;
  const from = Math.max(now.getTime(), u.proUntil?.getTime() ?? 0);
  await tx.update(schema.users).set({ plan: "pro", proUntil: new Date(from + days * DAY) }).where(eq(schema.users.id, userId));
}

/**
 * Применить код «+N дней» сразу. Для кодов-скидок не вызывается: скидка
 * учитывается при оплате (recordPromoPayment).
 */
export async function redeemDaysPromo(rawCode: unknown, user: User, now: Date = new Date()): Promise<PromoCheck> {
  const check = await checkPromo(rawCode, user, now);
  if (!check.ok) return check;
  if (check.promo.kind !== "days") return { ok: false, error: "Этот промокод даёт скидку — она применится при оплате" };
  const promo = check.promo;
  let applied = false;
  await db.transaction(async (tx) => {
    // Лимит проверяем ещё раз внутри транзакции под блокировкой строки кода.
    const [locked] = await tx.select().from(schema.promoCodes).where(eq(schema.promoCodes.code, promo.code)).for("update");
    if (!locked || (locked.maxUses !== null && locked.usedCount >= locked.maxUses)) return;
    if (!(await claimPromo(tx, promo.code, user.id, null))) return;
    if (promo.audience === "teacher") await extendTeacherDays(tx, user.id, promo.value, now);
    else await extendStudentDays(tx, user.id, promo.value, now);
    applied = true;
  });
  return applied ? check : { ok: false, error: "Промокод уже использовали максимальное число раз" };
}

/** Учёт кода-скидки при успешной оплате (вызывается из markPaymentSucceeded). */
export async function recordPromoPayment(tx: Tx, code: string, userId: string, paymentId: string): Promise<void> {
  await claimPromo(tx, code, userId, paymentId);
}

// ---------- Пригласи коллегу ----------

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomRefCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join("");
}

/** Личный код приглашения репетитора (создаётся при первом обращении). */
export async function ensureReferralCode(userId: string): Promise<string> {
  const [u] = await db.select({ code: schema.users.referralCode }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (u?.code) return u.code;
  for (let i = 0; i < 5; i++) {
    const code = randomRefCode();
    try {
      const done = await db
        .update(schema.users)
        .set({ referralCode: code })
        .where(and(eq(schema.users.id, userId), sql`${schema.users.referralCode} is null`))
        .returning({ code: schema.users.referralCode });
      if (done[0]?.code) return done[0].code;
      // Код уже успели создать параллельно — читаем его.
      const [again] = await db.select({ code: schema.users.referralCode }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
      if (again?.code) return again.code;
    } catch {
      /* редкое совпадение кода — пробуем другой */
    }
  }
  throw new Error("Не удалось создать код приглашения");
}

/** Репетитор по коду приглашения (null — нет такого). */
export async function findTeacherByReferral(raw: unknown): Promise<{ id: string; name: string } | null> {
  const code = String(raw ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{4,12}$/.test(code)) return null;
  const [t] = await db
    .select({ id: schema.users.id, name: schema.users.name, role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.referralCode, code))
    .limit(1);
  return t && t.role === "TEACHER" ? { id: t.id, name: t.name } : null;
}

export interface ReferralReward {
  inviterId: string;
  inviteeName: string;
}

/**
 * Бонус за приглашение — при первой успешной оплате приглашённого. Вызывается
 * внутри транзакции markPaymentSucceeded ПОСЛЕ продления тарифа приглашённого.
 */
export async function rewardReferralOnPayment(tx: Tx, inviteeId: string, now: Date = new Date()): Promise<ReferralReward | null> {
  const claimed = await tx
    .update(schema.users)
    .set({ referralRewardedAt: now })
    .where(
      and(
        eq(schema.users.id, inviteeId),
        sql`${schema.users.referredBy} is not null`,
        sql`${schema.users.referralRewardedAt} is null`
      )
    )
    .returning({ inviterId: schema.users.referredBy, name: schema.users.name });
  const row = claimed[0];
  if (!row?.inviterId) return null;
  await extendTeacherDays(tx, inviteeId, REFERRAL_BONUS_DAYS, now);
  const [inviter] = await tx.select({ id: schema.users.id, role: schema.users.role }).from(schema.users).where(eq(schema.users.id, row.inviterId)).limit(1);
  if (!inviter || inviter.role !== "TEACHER") return null;
  await extendTeacherDays(tx, inviter.id, REFERRAL_BONUS_DAYS, now);
  return { inviterId: inviter.id, inviteeName: row.name };
}

/** Сколько коллег пришло по ссылке и скольким уже начислен бонус. */
export async function getReferralStats(userId: string): Promise<{ joined: number; rewarded: number }> {
  const [r] = await db
    .select({
      joined: sql<number>`count(*)::int`,
      rewarded: sql<number>`count(${schema.users.referralRewardedAt})::int`,
    })
    .from(schema.users)
    .where(eq(schema.users.referredBy, userId));
  return { joined: r?.joined ?? 0, rewarded: r?.rewarded ?? 0 };
}
