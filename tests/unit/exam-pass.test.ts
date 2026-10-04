import { test, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db } from "../../lib/db/client";
import * as schema from "../../lib/db/schema";
import { getStudentExamPass } from "../../lib/tariffs";
import { EXAM_ACCESS_UNTIL } from "../../lib/exam-plan";
import { getOrCreatePayRequest, getPayRequest } from "../../lib/pay-requests";
import { createPendingPayment, markPaymentSucceeded, getUserById } from "../../lib/queries";
import { makeUser, cleanup } from "../helpers";

after(cleanup);
const RUN = Date.now().toString(36);
const END = new Date(`${EXAM_ACCESS_UNTIL}T23:59:59+03:00`).getTime();
const DAY = 86_400_000;

test("«До ЕГЭ» продаётся, пока до конца сезона больше месяца", () => {
  const oct = getStudentExamPass(new Date(END - 280 * DAY));
  assert.equal(oct.available, true);
  assert.ok(oct.perMonth < oct.priceRub);
  assert.equal(getStudentExamPass(new Date(END - 20 * DAY)).available, false);
});

test("оплата «До ЕГЭ»: Pro до конца сезона, более длинный Pro не урезается", async () => {
  const s = await makeUser({ role: "STUDENT", plan: "free" });
  const yk = `yk_${RUN}_exam1`;
  await createPendingPayment({ userId: s.id, yookassaPaymentId: yk, amountRub: 1490, periodDays: 280, paymentType: "student_pro", tier: "exam" });
  await markPaymentSucceeded(yk);
  const u = (await getUserById(s.id))!;
  assert.equal(u.plan, "pro");
  assert.equal(new Date(u.proUntil!).getTime(), END);

  const later = new Date(END + 40 * DAY);
  const s2 = await makeUser({ role: "STUDENT", plan: "pro", proUntil: later });
  const yk2 = `yk_${RUN}_exam2`;
  await createPendingPayment({ userId: s2.id, yookassaPaymentId: yk2, amountRub: 1490, periodDays: 280, paymentType: "student_pro", tier: "exam" });
  await markPaymentSucceeded(yk2);
  assert.equal(new Date((await getUserById(s2.id))!.proUntil!).getTime(), later.getTime());
});

test("ссылка «Попросить родителя»: одна на ученика, истекает, не для учеников репетитора", async () => {
  const s = await makeUser({ role: "STUDENT" });
  const t1 = await getOrCreatePayRequest(s.id);
  assert.equal(await getOrCreatePayRequest(s.id), t1);
  assert.equal((await getPayRequest(t1))?.student.id, s.id);
  assert.equal(await getPayRequest("nonsense"), null);
  assert.equal(await getPayRequest(t1, new Date(Date.now() + 15 * DAY)), null);

  const teacher = await makeUser({ role: "TEACHER" });
  await db.update(schema.users).set({ teacherId: teacher.id }).where(eq(schema.users.id, s.id));
  assert.equal(await getPayRequest(t1), null);
});
