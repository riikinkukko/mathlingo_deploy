// Платная проверка развёрнутого решения для учеников без репетитора.
//
// Ученик решил задачу второй части и сверился с эталоном (self_checked) —
// и может заказать проверку экспертом платформы за фиксированную цену.
// После оплаты попытка становится «на проверке» (pending), эксперт (владелец
// платформы или админ) проверяет её тем же экраном, что и репетитор: решение,
// пометки на фото, комментарий. Результат ученик видит в задаче и на
// странице «Мои проверки».
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "./db/client";
import * as schema from "./db/schema";
import { genId, getProblem, getSkill, mapUserRow, pushNotification, type PendingReview } from "./queries";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

export function isPaidReviewEnabled(): boolean {
  return process.env.PAID_REVIEW_ENABLED !== "0";
}

export function getPaidReviewPrice(): number {
  return Number(process.env.PAID_REVIEW_PRICE_RUB || 30);
}

/** Срок, который обещаем ученику (в днях). */
export const PAID_REVIEW_DAYS = 2;

export type ReviewOrderRow = typeof schema.reviewOrders.$inferSelect;

/**
 * Заказ проверки для попытки ученика: создаёт (или возвращает неоплаченный)
 * заказ. Ошибка — если попытку проверить нельзя.
 */
export async function prepareReviewOrder(studentId: string, attemptId: string): Promise<{ order: ReviewOrderRow } | { error: string }> {
  if (typeof attemptId !== "string" || !attemptId) return { error: "Решение не найдено" };
  const [attempt] = await db.select().from(schema.attempts).where(eq(schema.attempts.id, attemptId)).limit(1);
  if (!attempt || attempt.studentId !== studentId) return { error: "Решение не найдено" };
  const problem = await getProblem(attempt.problemId);
  if (!problem || problem.answerType !== "DETAILED") return { error: "Проверка доступна только для развёрнутых решений" };
  const [existing] = await db.select().from(schema.reviewOrders).where(eq(schema.reviewOrders.attemptId, attemptId)).limit(1);
  if (existing) {
    if (existing.status !== "awaiting_payment") return { error: "Это решение уже отправлено на проверку" };
    return { order: existing };
  }
  if (attempt.reviewStatus !== "self_checked") return { error: "Это решение уже проверяется" };
  const order = { id: genId("ro"), attemptId, studentId, status: "awaiting_payment", priceRub: getPaidReviewPrice() };
  await db.insert(schema.reviewOrders).values(order).onConflictDoNothing();
  const [row] = await db.select().from(schema.reviewOrders).where(eq(schema.reviewOrders.attemptId, attemptId)).limit(1);
  return { order: row };
}

/** Оплата прошла (из markPaymentSucceeded): решение уходит эксперту. */
export async function markReviewOrderPaid(tx: Tx, orderId: string): Promise<{ studentName: string } | null> {
  const claimed = await tx
    .update(schema.reviewOrders)
    .set({ status: "paid", paidAt: new Date() })
    .where(and(eq(schema.reviewOrders.id, orderId), eq(schema.reviewOrders.status, "awaiting_payment")))
    .returning();
  const order = claimed[0];
  if (!order) return null;
  await tx.update(schema.attempts).set({ reviewStatus: "pending" }).where(eq(schema.attempts.id, order.attemptId));
  const [student] = await tx.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, order.studentId)).limit(1);
  return { studentName: student?.name ?? "Ученик" };
}

/** Уведомить экспертов (владельцы платформы) о новой оплаченной проверке. */
export async function notifyReviewers(studentName: string): Promise<void> {
  const reviewers = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.role, "TEACHER"), eq(schema.users.isPlatformOwner, true)));
  for (const r of reviewers) {
    await pushNotification(db, {
      userId: r.id,
      type: "review_pending",
      title: `Платная проверка: ${studentName}`,
      body: `Оплачена проверка развёрнутого решения — срок ${PAID_REVIEW_DAYS} дня.`,
      link: "/teacher/checks",
    }).catch((e) => console.error("Уведомление эксперту не ушло:", e));
  }
}

/** Может ли этот пользователь проверять платные решения. */
export function isReviewer(u: { role: string; isPlatformOwner?: boolean; isAdmin?: boolean }): boolean {
  return u.role === "TEACHER" && (!!u.isPlatformOwner || !!u.isAdmin);
}

/** Заказ по попытке, если он оплачен (проверяет эксперт) — иначе null. */
export async function getPaidOrderForAttempt(attemptId: string): Promise<ReviewOrderRow | null> {
  const [o] = await db
    .select()
    .from(schema.reviewOrders)
    .where(and(eq(schema.reviewOrders.attemptId, attemptId), or(eq(schema.reviewOrders.status, "paid"), eq(schema.reviewOrders.status, "done"))))
    .limit(1);
  return o ?? null;
}

export async function countPaidChecksWaiting(): Promise<number> {
  const rows = await db.select({ id: schema.reviewOrders.id }).from(schema.reviewOrders).where(eq(schema.reviewOrders.status, "paid"));
  return rows.length;
}

export async function markReviewOrderDone(orderId: string): Promise<void> {
  await db.update(schema.reviewOrders).set({ status: "done", doneAt: new Date() }).where(eq(schema.reviewOrders.id, orderId));
}

/** Очередь эксперта: оплаченные и ещё не проверенные решения (старые сверху). */
export async function getPaidReviewQueue(): Promise<(PendingReview & { paidAt: string; orderId: string })[]> {
  const orders = await db
    .select()
    .from(schema.reviewOrders)
    .where(eq(schema.reviewOrders.status, "paid"))
    .orderBy(schema.reviewOrders.paidAt);
  if (orders.length === 0) return [];
  const attempts = await db.select().from(schema.attempts).where(inArray(schema.attempts.id, orders.map((o) => o.attemptId)));
  const students = await db.select().from(schema.users).where(inArray(schema.users.id, orders.map((o) => o.studentId)));
  const withImage = new Set(
    (
      await db
        .select({ id: schema.attemptImages.attemptId })
        .from(schema.attemptImages)
        .where(inArray(schema.attemptImages.attemptId, orders.map((o) => o.attemptId)))
    ).map((r) => r.id)
  );
  const out: (PendingReview & { paidAt: string; orderId: string })[] = [];
  for (const o of orders) {
    const a = attempts.find((x) => x.id === o.attemptId);
    const st = students.find((x) => x.id === o.studentId);
    if (!a || !st) continue;
    const problem = await getProblem(a.problemId);
    if (!problem) continue;
    const skill = problem.skillId ? await getSkill(problem.skillId) : undefined;
    out.push({
      attemptId: a.id,
      student: mapUserRow(st),
      problem,
      skillTitle: skill?.title ?? "—",
      answer: a.answer,
      submittedAt: a.createdAt.toISOString(),
      hasImage: withImage.has(a.id),
      paidAt: (o.paidAt ?? o.createdAt).toISOString(),
      orderId: o.id,
    });
  }
  return out;
}

export interface StudentCheck {
  orderId: string;
  attemptId: string;
  status: "awaiting_payment" | "paid" | "done";
  decision: "approved" | "needs_revision" | null;
  feedback: string | null;
  problemText: string;
  skillId: string | null;
  skillTitle: string;
  hasImage: boolean;
  hasMarkup: boolean;
  createdAt: string;
  doneAt: string | null;
}

/** «Мои проверки» ученика: оплаченные и проверенные (неоплаченные не показываем). */
export async function getStudentChecks(studentId: string): Promise<StudentCheck[]> {
  const orders = await db
    .select()
    .from(schema.reviewOrders)
    .where(and(eq(schema.reviewOrders.studentId, studentId), or(eq(schema.reviewOrders.status, "paid"), eq(schema.reviewOrders.status, "done"))))
    .orderBy(desc(schema.reviewOrders.createdAt));
  if (orders.length === 0) return [];
  const ids = orders.map((o) => o.attemptId);
  const attempts = await db.select().from(schema.attempts).where(inArray(schema.attempts.id, ids));
  const images = await db
    .select({ id: schema.attemptImages.attemptId, annotated: schema.attemptImages.annotated })
    .from(schema.attemptImages)
    .where(inArray(schema.attemptImages.attemptId, ids));
  const out: StudentCheck[] = [];
  for (const o of orders) {
    const a = attempts.find((x) => x.id === o.attemptId);
    if (!a) continue;
    const problem = await getProblem(a.problemId);
    const skill = problem?.skillId ? await getSkill(problem.skillId) : undefined;
    const img = images.find((i) => i.id === a.id);
    out.push({
      orderId: o.id,
      attemptId: a.id,
      status: o.status as StudentCheck["status"],
      decision: a.reviewStatus === "approved" || a.reviewStatus === "needs_revision" ? a.reviewStatus : null,
      feedback: a.teacherFeedback,
      problemText: problem?.text ?? "",
      skillId: problem?.skillId ?? null,
      skillTitle: skill?.title ?? "",
      hasImage: !!img,
      hasMarkup: !!img?.annotated,
      createdAt: o.createdAt.toISOString(),
      doneAt: o.doneAt ? o.doneAt.toISOString() : null,
    });
  }
  return out;
}
