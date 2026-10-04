import { test, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db } from "../../lib/db/client";
import * as schema from "../../lib/db/schema";
import { teacherPlanState, convertRemainingDays, TEACHER_TIERS } from "../../lib/teacher-plan";
import { createPendingPayment, markPaymentSucceeded, genId, getUserById } from "../../lib/queries";
import { makeUser, cleanup } from "../helpers";

after(cleanup);
const DAY = 86_400_000;
const now = Date.now();
const base = { teacherPlan: "free" as const, teacherProUntil: undefined, teacherTier: null, teacherTrialUntil: undefined, isPlatformOwner: false };

test("состояние тарифа: бесплатно, пробный, оплаченный, владелец", () => {
  assert.deepEqual([teacherPlanState(base).tier, teacherPlanState(base).limit], ["free", 3]);
  const trial = teacherPlanState({ ...base, teacherTrialUntil: new Date(now + 5 * DAY).toISOString() });
  assert.equal(trial.source, "trial");
  assert.equal(trial.limit, Infinity);
  assert.equal(trial.trialDaysLeft, 5);
  const ended = teacherPlanState({ ...base, teacherTrialUntil: new Date(now - DAY).toISOString() });
  assert.equal(ended.tier, "free");
  const std = teacherPlanState({ ...base, teacherPlan: "pro", teacherTier: "standard", teacherProUntil: new Date(now + 10 * DAY).toISOString() });
  assert.deepEqual([std.tier, std.limit, std.source], ["standard", 15, "paid"]);
  // старый платящий (тариф не указан) = «Профи»
  const legacy = teacherPlanState({ ...base, teacherPlan: "pro", teacherProUntil: new Date(now + 10 * DAY).toISOString() });
  assert.equal(legacy.tier, "pro");
  // оплаченный «Репетитор» во время пробного не урезает: действует «Профи»
  const stdTrial = teacherPlanState({ ...base, teacherPlan: "pro", teacherTier: "standard", teacherProUntil: new Date(now + 40 * DAY).toISOString(), teacherTrialUntil: new Date(now + 3 * DAY).toISOString() });
  assert.deepEqual([stdTrial.tier, stdTrial.source, stdTrial.paidTier], ["pro", "trial", "standard"]);
  // истёкшая оплата → бесплатно
  const expired = teacherPlanState({ ...base, teacherPlan: "pro", teacherTier: "pro", teacherProUntil: new Date(now - DAY).toISOString() });
  assert.equal(expired.tier, "free");
  assert.equal(teacherPlanState({ ...base, isPlatformOwner: true }).limit, Infinity);
});

test("пересчёт остатка при смене тарифа — по цене за день", () => {
  // 15 дней «Репетитора» (23 ₽/день) → «Профи» (43 ₽/день) ≈ 8 дней
  assert.equal(convertRemainingDays(15 * DAY, { tier: "standard", period: "month" }, { tier: "pro", period: "month" }), 8);
  // в обратную сторону — больше дней
  assert.equal(convertRemainingDays(15 * DAY, { tier: "pro", period: "month" }, { tier: "standard", period: "month" }), 28);
  assert.equal(convertRemainingDays(-5, { tier: "pro", period: "month" }, { tier: "pro", period: "year" }), 0);
});

test("оплата тарифа: продление, смена тарифа без потери дней, старые платежи", async () => {
  const t = await makeUser({ role: "TEACHER" });
  const pay = async (tier: "standard" | "pro" | undefined, period: "month" | "year" | undefined, days: number) => {
    const yk = genId("yk");
    await createPendingPayment({ userId: t.id, yookassaPaymentId: yk, amountRub: 1, periodDays: days, paymentType: "teacher_pro", tier, billingPeriod: period });
    await markPaymentSucceeded(yk, { id: "pm_1", cardLast4: "4242" });
  };
  await pay("standard", "month", 30);
  let u = (await getUserById(t.id))!;
  assert.equal(u.teacherTier, "standard");
  assert.ok(Math.abs(new Date(u.teacherProUntil!).getTime() - (Date.now() + 30 * DAY)) < 60_000);
  // переход на «Профи» через 0 дней использования: 30 дн. «Репетитора» → 16 дн. «Профи» + 30
  await pay("pro", "month", 30);
  u = (await getUserById(t.id))!;
  assert.equal(u.teacherTier, "pro");
  const daysLeft = (new Date(u.teacherProUntil!).getTime() - Date.now()) / DAY;
  assert.ok(daysLeft > 45 && daysLeft < 47, `осталось ${daysLeft}`);
  // тот же тариф — просто +30
  await pay("pro", "month", 30);
  u = (await getUserById(t.id))!;
  assert.ok((new Date(u.teacherProUntil!).getTime() - Date.now()) / DAY > 75);
  // платёж старого образца (без тарифа) — «Профи» помесячно
  const t2 = await makeUser({ role: "TEACHER" });
  const yk = genId("yk");
  await createPendingPayment({ userId: t2.id, yookassaPaymentId: yk, amountRub: 1499, periodDays: 30, paymentType: "teacher_pro" });
  await markPaymentSucceeded(yk);
  const u2 = (await getUserById(t2.id))!;
  assert.deepEqual([u2.teacherTier, u2.teacherBillingPeriod], ["pro", "month"]);
  await db.delete(schema.payments).where(eq(schema.payments.userId, t.id));
  await db.delete(schema.payments).where(eq(schema.payments.userId, t2.id));
  assert.equal(TEACHER_TIERS.standard.year, 6900);
});
