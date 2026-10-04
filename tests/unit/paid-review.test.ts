import { test, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db } from "../../lib/db/client";
import * as schema from "../../lib/db/schema";
import { prepareReviewOrder, getPaidReviewQueue, getStudentChecks, getPaidOrderForAttempt, markReviewOrderDone } from "../../lib/paid-review";
import { createPendingPayment, markPaymentSucceeded, genId } from "../../lib/queries";
import { makeUser, cleanup } from "../helpers";

after(cleanup);
const RUN = Date.now().toString(36);

async function detailedProblemId(): Promise<string> {
  const [p] = await db.select({ id: schema.problems.id }).from(schema.problems).where(eq(schema.problems.answerType, "DETAILED")).limit(1);
  return p.id;
}
async function numberProblemId(): Promise<string> {
  const [p] = await db.select({ id: schema.problems.id }).from(schema.problems).where(eq(schema.problems.answerType, "NUMBER")).limit(1);
  return p.id;
}
async function attempt(studentId: string, problemId: string, reviewStatus: "self_checked" | "pending" | null = "self_checked") {
  const id = genId("a");
  await db.insert(schema.attempts).values({ id, studentId, problemId, answer: "решение", isCorrect: true, source: "lesson", reviewStatus });
  return id;
}

test("заказ проверки: только своё развёрнутое решение после самопроверки, один раз", async () => {
  const s = await makeUser({ role: "STUDENT", plan: "pro" });
  const other = await makeUser({ role: "STUDENT" });
  const a = await attempt(s.id, await detailedProblemId());
  const first = await prepareReviewOrder(s.id, a);
  assert.ok("order" in first);
  const again = await prepareReviewOrder(s.id, a);
  assert.ok("order" in again && again.order.id === (first as { order: { id: string } }).order.id); // неоплаченный — тот же
  assert.ok("error" in (await prepareReviewOrder(other.id, a)));
  assert.ok("error" in (await prepareReviewOrder(s.id, await attempt(s.id, await numberProblemId(), null))));
  assert.ok("error" in (await prepareReviewOrder(s.id, await attempt(s.id, await detailedProblemId(), "pending"))));
});

test("оплата проверки: решение уходит эксперту, затем результат виден ученику", async () => {
  const s = await makeUser({ role: "STUDENT", plan: "pro", name: "Ученик Проверки" });
  const a = await attempt(s.id, await detailedProblemId());
  const prep = await prepareReviewOrder(s.id, a);
  const order = (prep as { order: { id: string; priceRub: number } }).order;
  const yk = `yk_${RUN}_rev`;
  await createPendingPayment({ userId: s.id, yookassaPaymentId: yk, amountRub: order.priceRub, periodDays: 0, paymentType: "review_check", reviewOrderId: order.id });
  assert.equal(await getPaidOrderForAttempt(a), null); // до оплаты эксперт не видит
  await markPaymentSucceeded(yk);
  await markPaymentSucceeded(yk);

  const [att] = await db.select().from(schema.attempts).where(eq(schema.attempts.id, a));
  assert.equal(att.reviewStatus, "pending");
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, s.id));
  assert.equal(u.plan, "pro"); // тариф не тронут
  const queue = await getPaidReviewQueue();
  assert.ok(queue.some((q) => q.attemptId === a && q.student.name === "Ученик Проверки"));
  assert.equal((await getStudentChecks(s.id))[0].status, "paid");

  await db.update(schema.attempts).set({ reviewStatus: "needs_revision", isCorrect: false, teacherFeedback: "Нет обоснования" }).where(eq(schema.attempts.id, a));
  await markReviewOrderDone((await getPaidOrderForAttempt(a))!.id);
  const [check] = await getStudentChecks(s.id);
  assert.deepEqual([check.status, check.decision, check.feedback], ["done", "needs_revision", "Нет обоснования"]);
  assert.ok(!(await getPaidReviewQueue()).some((q) => q.attemptId === a));
});
