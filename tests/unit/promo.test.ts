import { test, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db } from "../../lib/db/client";
import * as schema from "../../lib/db/schema";
import {
  checkPromo,
  discountedPrice,
  normalizePromoCode,
  redeemDaysPromo,
  ensureReferralCode,
  findTeacherByReferral,
  REFERRAL_BONUS_DAYS,
} from "../../lib/promo";
import { createPendingPayment, markPaymentSucceeded, getUserById } from "../../lib/queries";
import { makeUser, cleanup } from "../helpers";

const RUN = Date.now().toString(36).toUpperCase();
const codes: string[] = [];
async function makePromo(over: Partial<typeof schema.promoCodes.$inferInsert> & { kind: "percent" | "days"; value: number }) {
  const code = `T${RUN}${codes.length}`;
  codes.push(code);
  await db.insert(schema.promoCodes).values({ code, audience: "teacher", ...over });
  return code;
}
after(async () => {
  for (const c of codes) await db.delete(schema.promoCodes).where(eq(schema.promoCodes.code, c));
  await cleanup();
});
const DAY = 86_400_000;

test("нормализация кода и цена со скидкой", () => {
  assert.equal(normalizePromoCode("  start 30 "), "START30");
  assert.equal(normalizePromoCode("лето2026"), "ЛЕТО2026");
  assert.equal(normalizePromoCode("a"), null);
  assert.equal(normalizePromoCode("<script>"), null);
  assert.equal(discountedPrice(690, 30), 483);
  assert.equal(discountedPrice(249, 99), 2); // не ноль
});

test("проверка кода: аудитория, срок, лимит, повтор", async () => {
  const teacher = await makeUser({ role: "TEACHER" });
  const student = await makeUser({ role: "STUDENT" });
  const pupil = await makeUser({ role: "STUDENT", teacherId: teacher.id });
  const c = await makePromo({ kind: "percent", value: 30 });
  assert.equal((await checkPromo(c.toLowerCase(), teacher)).ok, true);
  assert.match((await checkPromo(c, student) as { error: string }).error, /для репетиторов/);
  const sc = await makePromo({ kind: "percent", value: 20, audience: "student" });
  assert.equal((await checkPromo(sc, student)).ok, true);
  assert.equal((await checkPromo(sc, pupil)).ok, false); // ученик репетитора не платит сам
  const expired = await makePromo({ kind: "days", value: 7, expiresAt: new Date(Date.now() - DAY) });
  assert.match((await checkPromo(expired, teacher) as { error: string }).error, /Срок/);
  const off = await makePromo({ kind: "days", value: 7, active: false });
  assert.equal((await checkPromo(off, teacher)).ok, false);
  assert.equal((await checkPromo("NOSUCHCODE", teacher)).ok, false);
});

test("код «+N дней»: продлевает пробный, второй раз и сверх лимита — нельзя", async () => {
  const t1 = await makeUser({ role: "TEACHER", teacherTrialUntil: new Date(Date.now() + 5 * DAY) });
  const t2 = await makeUser({ role: "TEACHER" });
  const code = await makePromo({ kind: "days", value: 10, maxUses: 1 });
  const before = new Date(t1.teacherTrialUntil!).getTime();
  assert.equal((await redeemDaysPromo(code, t1)).ok, true);
  const after1 = new Date((await getUserById(t1.id))!.teacherTrialUntil!).getTime();
  assert.ok(Math.abs(after1 - before - 10 * DAY) < 5000);
  assert.match((await redeemDaysPromo(code, t1) as { error: string }).error, /уже использовали|максимальное/);
  assert.equal((await redeemDaysPromo(code, t2)).ok, false); // лимит 1
  const [row] = await db.select().from(schema.promoCodes).where(eq(schema.promoCodes.code, code));
  assert.equal(row.usedCount, 1);
});

test("код «+N дней» платящему репетитору — к оплаченному сроку", async () => {
  const until = new Date(Date.now() + 20 * DAY);
  const t = await makeUser({ role: "TEACHER", teacherPlan: "pro", teacherTier: "standard", teacherProUntil: until });
  const code = await makePromo({ kind: "days", value: 7 });
  await redeemDaysPromo(code, t);
  const u = (await getUserById(t.id))!;
  assert.equal(new Date(u.teacherProUntil!).getTime(), until.getTime() + 7 * DAY);
});

test("скидка: учитывается при оплате и только на первую", async () => {
  const t = await makeUser({ role: "TEACHER" });
  const code = await makePromo({ kind: "percent", value: 30 });
  const yk = `yk_${RUN}_disc`;
  await createPendingPayment({ userId: t.id, yookassaPaymentId: yk, amountRub: discountedPrice(690, 30), periodDays: 30, paymentType: "teacher_pro", tier: "standard", billingPeriod: "month", promoCode: code });
  await markPaymentSucceeded(yk);
  await markPaymentSucceeded(yk); // повтор вебхука
  const [row] = await db.select().from(schema.promoCodes).where(eq(schema.promoCodes.code, code));
  assert.equal(row.usedCount, 1);
  // второй код-скидка после оплаты уже не подходит
  const other = await makePromo({ kind: "percent", value: 10 });
  assert.match((await checkPromo(other, t) as { error: string }).error, /первую оплату/);
});

test("пригласи коллегу: +30 дней обоим после первой оплаты, один раз", async () => {
  const inviter = await makeUser({ role: "TEACHER", teacherTrialUntil: new Date(Date.now() - DAY) });
  const ref = await ensureReferralCode(inviter.id);
  assert.equal(await ensureReferralCode(inviter.id), ref); // код не меняется
  assert.equal((await findTeacherByReferral(ref.toLowerCase()))?.id, inviter.id);
  const invitee = await makeUser({ role: "TEACHER", referredBy: inviter.id });

  const yk1 = `yk_${RUN}_ref1`;
  await createPendingPayment({ userId: invitee.id, yookassaPaymentId: yk1, amountRub: 690, periodDays: 30, paymentType: "teacher_pro", tier: "standard", billingPeriod: "month" });
  await markPaymentSucceeded(yk1);
  const inv = (await getUserById(invitee.id))!;
  const daysPaid = (new Date(inv.teacherProUntil!).getTime() - Date.now()) / DAY;
  assert.ok(daysPaid > 30 + REFERRAL_BONUS_DAYS - 1 && daysPaid < 30 + REFERRAL_BONUS_DAYS + 1, `оплачено дней: ${daysPaid}`);
  // пригласивший не платит — дни ушли в пробный «Профи», начиная с сегодня
  const host = (await getUserById(inviter.id))!;
  const trialDays = (new Date(host.teacherTrialUntil!).getTime() - Date.now()) / DAY;
  assert.ok(trialDays > REFERRAL_BONUS_DAYS - 1 && trialDays <= REFERRAL_BONUS_DAYS, `пробный: ${trialDays}`);
  const notes = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, inviter.id));
  assert.equal(notes.length, 1);

  // продление приглашённого бонус не повторяет
  const yk2 = `yk_${RUN}_ref2`;
  await createPendingPayment({ userId: invitee.id, yookassaPaymentId: yk2, amountRub: 690, periodDays: 30, paymentType: "teacher_pro", tier: "standard", billingPeriod: "month" });
  await markPaymentSucceeded(yk2);
  const host2 = (await getUserById(inviter.id))!;
  assert.equal(host2.teacherTrialUntil, host.teacherTrialUntil);
});
