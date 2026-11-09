/**
 * Автопродление тарифа репетитора: учёт платежа и неудачных попыток.
 * Вызывается из cron (app/api/cron/renew-teacher-subscriptions) и из вебхука
 * ЮKassa (app/api/webhooks/yookassa). Правила — lib/renewal-rules.ts.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "./db/client";
import * as schema from "./db/schema";
import { genId, pushNotification } from "./queries";
import { renewalFailureMessage } from "./renewal-rules";

export interface RenewalInfo {
  userId: string;
  yookassaPaymentId: string;
  amountRub: number;
  periodDays: number;
  tier: "standard" | "pro";
  billingPeriod: "month" | "year";
}

/**
 * Записывает платёж автопродления. Безопасно вызывать дважды (cron и вебхук
 * могут прийти в любом порядке): повтор по тому же id ЮKassa ничего не делает.
 */
export async function recordRenewalPayment(p: RenewalInfo): Promise<void> {
  await db
    .insert(schema.payments)
    .values({
      id: genId("pay"),
      userId: p.userId,
      yookassaPaymentId: p.yookassaPaymentId,
      amountRub: p.amountRub,
      periodDays: p.periodDays,
      status: "pending",
      paymentType: "teacher_pro",
      isRecurringSetup: false,
      tier: p.tier,
      billingPeriod: p.billingPeriod,
    })
    .onConflictDoNothing({ target: schema.payments.yookassaPaymentId });
}

/** Метаданные, которые cron кладёт в платёж ЮKassa, — по ним вебхук восстановит запись. */
export function renewalMetadata(p: Omit<RenewalInfo, "yookassaPaymentId" | "amountRub">): Record<string, string> {
  return {
    userId: p.userId,
    type: "teacher_pro_renewal",
    tier: p.tier,
    period: p.billingPeriod,
    days: String(p.periodDays),
  };
}

/**
 * Вебхук пришёл раньше, чем cron успел записать платёж: восстанавливаем запись
 * по метаданным платежа (сумму берём из ответа ЮKassa — он проверен запросом к API).
 * Возвращает true, если это платёж автопродления и запись теперь есть.
 */
export async function recoverRenewalFromMetadata(info: {
  id: string;
  amountRub: number;
  metadata?: Record<string, string>;
}): Promise<boolean> {
  const m = info.metadata;
  if (!m || m.type !== "teacher_pro_renewal" || !m.userId) return false;
  const tier = m.tier === "standard" ? "standard" : "pro";
  const billingPeriod = m.period === "year" ? "year" : "month";
  const periodDays = Number(m.days) > 0 ? Number(m.days) : billingPeriod === "year" ? 365 : 30;
  const [u] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, m.userId)).limit(1);
  if (!u) return false;
  await recordRenewalPayment({ userId: m.userId, yookassaPaymentId: info.id, amountRub: info.amountRub, periodDays, tier, billingPeriod });
  return true;
}

/** Неудачное автопродление: +1 к счётчику и уведомление репетитору. */
export async function onRenewalFailed(userId: string): Promise<number> {
  const [row] = await db
    .update(schema.users)
    .set({ renewalFailures: sql`${schema.users.renewalFailures} + 1`, renewalFailedAt: new Date() })
    .where(eq(schema.users.id, userId))
    .returning({ failures: schema.users.renewalFailures });
  const failures = row?.failures ?? 0;
  const msg = renewalFailureMessage(failures);
  await db
    .transaction((tx) =>
      pushNotification(tx, { userId, type: "plan_reminder", title: msg.title, body: msg.body, link: "/teacher/upgrade" })
    )
    .catch((e) => console.error("[renewal] уведомление не ушло", e));
  return failures;
}
