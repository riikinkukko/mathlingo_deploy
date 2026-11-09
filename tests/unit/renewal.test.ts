import { test, after } from "node:test";
import assert from "node:assert/strict";
import { eq, sql } from "drizzle-orm";
import { db } from "../../lib/db/client";
import * as schema from "../../lib/db/schema";
import {
  getMockScores,
  getStudentNotes,
  getStudentPayments,
  getTeachersDueForRenewal,
  getUserById,
  markPaymentCanceled,
  markPaymentSucceeded,
} from "../../lib/queries";
import { onRenewalFailed, recordRenewalPayment, recoverRenewalFromMetadata, renewalMetadata } from "../../lib/renewal";
import { RENEWAL_MAX_ATTEMPTS } from "../../lib/renewal-rules";
import { makeUser, cleanup } from "../helpers";

after(cleanup);

let k = 0;
const ykId = () => `yk_ren_${Date.now().toString(36)}_${++k}`;

async function dueTeacher() {
  return makeUser({
    role: "TEACHER",
    teacherPlan: "pro",
    teacherTier: "standard",
    teacherBillingPeriod: "month",
    teacherProUntil: new Date(Date.now() - 3600_000),
    yookassaPaymentMethodId: "pm_test",
  });
}
const isDue = async (id: string) => (await getTeachersDueForRenewal()).some((t) => t.id === id);

test("автопродление: запись платежа дважды — одна строка, оплата продлевает и сбрасывает счётчик", async () => {
  const t = await dueTeacher();
  await db.update(schema.users).set({ renewalFailures: 2, renewalFailedAt: new Date(Date.now() - 10 * 86400_000) }).where(eq(schema.users.id, t.id));
  const id = ykId();
  const info = { userId: t.id, yookassaPaymentId: id, amountRub: 690, periodDays: 30, tier: "standard" as const, billingPeriod: "month" as const };
  await recordRenewalPayment(info);
  await recordRenewalPayment(info); // вебхук и cron в любом порядке
  const rows = await db.select().from(schema.payments).where(eq(schema.payments.yookassaPaymentId, id));
  assert.equal(rows.length, 1);
  await markPaymentSucceeded(id);
  await markPaymentSucceeded(id); // повтор не продлевает второй раз
  const u = (await getUserById(t.id))!;
  const days = (new Date(u.teacherProUntil!).getTime() - Date.now()) / 86400_000;
  assert.ok(days > 29 && days < 31, `продлено на месяц, а не на ${days}`);
  const [r] = await db.select({ f: schema.users.renewalFailures }).from(schema.users).where(eq(schema.users.id, t.id));
  assert.equal(r.f, 0);
});

test("автопродление: вебхук раньше cron — запись восстанавливается по метаданным", async () => {
  const t = await dueTeacher();
  const id = ykId();
  const meta = renewalMetadata({ userId: t.id, periodDays: 30, tier: "standard", billingPeriod: "month" });
  assert.equal(await recoverRenewalFromMetadata({ id, amountRub: 690, metadata: meta }), true);
  await markPaymentSucceeded(id);
  const u = (await getUserById(t.id))!;
  assert.ok(new Date(u.teacherProUntil!).getTime() > Date.now() + 29 * 86400_000);
  // Чужие метаданные (не автопродление) не восстанавливаются.
  assert.equal(await recoverRenewalFromMetadata({ id: ykId(), amountRub: 1, metadata: { userId: t.id, type: "teacher_pro" } }), false);
});

test("автопродление: отмена засчитывается один раз, повторы — через день, потом стоп", async () => {
  const t = await dueTeacher();
  assert.equal(await isDue(t.id), true);

  // Пока висит незавершённый платёж — второе списание не создаём.
  const pend = ykId();
  await recordRenewalPayment({ userId: t.id, yookassaPaymentId: pend, amountRub: 690, periodDays: 30, tier: "standard", billingPeriod: "month" });
  assert.equal(await isDue(t.id), false);

  const c1 = await markPaymentCanceled(pend);
  assert.ok(c1 && c1.paymentType === "teacher_pro" && !c1.isRecurringSetup);
  assert.equal(await markPaymentCanceled(pend), null, "повторное уведомление об отмене не считается");
  assert.equal(await onRenewalFailed(t.id), 1);
  assert.equal(await isDue(t.id), false, "сразу после неудачи не повторяем");

  await db.update(schema.users).set({ renewalFailedAt: new Date(Date.now() - 25 * 3600_000) }).where(eq(schema.users.id, t.id));
  assert.equal(await isDue(t.id), true, "через день — повтор");

  await onRenewalFailed(t.id);
  await db.update(schema.users).set({ renewalFailedAt: new Date(Date.now() - 25 * 3600_000) }).where(eq(schema.users.id, t.id));
  assert.equal(await isDue(t.id), false, "после 2-й неудачи ждём 2 дня");

  for (let i = 2; i < RENEWAL_MAX_ATTEMPTS; i++) await onRenewalFailed(t.id);
  await db.update(schema.users).set({ renewalFailedAt: new Date(Date.now() - 30 * 86400_000) }).where(eq(schema.users.id, t.id));
  assert.equal(await isDue(t.id), false, "после последней попытки больше не списываем");

  const notes = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, t.id));
  assert.ok(notes.some((n) => n.title.includes("остановлено")));
});

test("смена репетитора: заметки, оплаты и пробники прежнего не видны новому", async () => {
  const a = await makeUser({ role: "TEACHER" });
  const b = await makeUser({ role: "TEACHER" });
  const s = await makeUser({ teacherId: a.id });
  await db.insert(schema.studentNotes).values({ studentId: s.id, teacherId: a.id, notes: "секрет А" });
  await db.insert(schema.studentPayments).values({ id: `sp_${ykId()}`, teacherId: a.id, studentId: s.id, amountRub: 2000, lessonsCount: 1, paidAt: "2026-10-01" });
  await db.insert(schema.mockScores).values({ id: `ms_${ykId()}`, teacherId: a.id, studentId: s.id, score: 70, takenAt: "2026-10-01", note: "коммент А" });
  await db.update(schema.users).set({ teacherId: b.id }).where(eq(schema.users.id, s.id));

  assert.equal((await getStudentNotes(s.id, b.id)).notes, "");
  assert.equal((await getStudentPayments(s.id, b.id)).length, 0);
  assert.equal((await getMockScores(s.id, b.id)).length, 0);

  // Новый репетитор пишет свои заметки — заметки прежнего не перезаписываются.
  await db
    .insert(schema.studentNotes)
    .values({ studentId: s.id, teacherId: b.id, notes: "заметка Б" })
    .onConflictDoUpdate({ target: [schema.studentNotes.studentId, schema.studentNotes.teacherId], set: { notes: "заметка Б" } });
  assert.equal((await getStudentNotes(s.id, a.id)).notes, "секрет А");
  assert.equal((await getStudentNotes(s.id, b.id)).notes, "заметка Б");
  assert.equal((await getStudentPayments(s.id, a.id)).length, 1);
  const [{ n }] = (await db.execute(sql`select count(*)::int as n from student_notes where student_id = ${s.id}`)).rows as { n: number }[];
  assert.equal(Number(n), 2);
});
