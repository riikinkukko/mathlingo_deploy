import { test, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db } from "../../lib/db/client";
import * as schema from "../../lib/db/schema";
import { applyLessonStatus } from "../../lib/lesson-status";
import { genId, getStudentBalance, getOrCreateAssignmentSession, spendEnergy } from "../../lib/queries";
import { makeUser, makeHomework, problems, cleanup } from "../helpers";

after(cleanup);

async function lesson(teacherId: string, studentId: string, extra: Partial<typeof schema.scheduledLessons.$inferInsert> = {}) {
  const id = genId("sl");
  await db.insert(schema.scheduledLessons).values({ id, teacherId, studentId, startsAt: new Date(Date.now() - 3600_000), durationMin: 60, ...extra });
  return id;
}
async function pay(teacherId: string, studentId: string, amountRub: number, lessonsCount = 1) {
  await db.insert(schema.studentPayments).values({ id: genId("sp"), teacherId, studentId, amountRub, lessonsCount, paidAt: "2026-10-01" });
}

test("без цены — баланс в занятиях, как раньше", async () => {
  const t = await makeUser({ role: "TEACHER" });
  const s = await makeUser({ teacherId: t.id });
  await pay(t.id, s.id, 4000, 2);
  for (let i = 0; i < 3; i++) await applyLessonStatus(t.id, await lesson(t.id, s.id), "done");
  const b = (await getStudentBalance(t.id, s.id))!;
  assert.equal(b.balance, -1);
  assert.equal(b.balanceRub, null);
});

test("с ценой — долг в рублях; цена фиксируется при отметке", async () => {
  const t = await makeUser({ role: "TEACHER" });
  const s = await makeUser({ teacherId: t.id, lessonPriceRub: 2000 } as never);
  await pay(t.id, s.id, 5000);
  await applyLessonStatus(t.id, await lesson(t.id, s.id), "done"); // 2000
  await applyLessonStatus(t.id, await lesson(t.id, s.id), "done"); // 2000
  await db.update(schema.users).set({ lessonPriceRub: 2500 }).where(eq(schema.users.id, s.id));
  await applyLessonStatus(t.id, await lesson(t.id, s.id), "done"); // 2500 по новой цене
  const b = (await getStudentBalance(t.id, s.id))!;
  assert.equal(b.balanceRub, 5000 - 2000 - 2000 - 2500); // −1500
  assert.equal(b.balance, -1); // долг округляется до занятия вверх
  assert.equal(b.priceRub, 2500);
});

test("старые занятия без зафиксированной цены считаются по текущей цене", async () => {
  const t = await makeUser({ role: "TEACHER" });
  const s = await makeUser({ teacherId: t.id });
  await pay(t.id, s.id, 6000, 3);
  for (let i = 0; i < 3; i++) await applyLessonStatus(t.id, await lesson(t.id, s.id), "done");
  await db.update(schema.users).set({ lessonPriceRub: 2000 }).where(eq(schema.users.id, s.id));
  const b = (await getStudentBalance(t.id, s.id))!;
  assert.equal(b.balanceRub, 0); // 6000 − 3 × 2000 — в расчёте, а не «+6000»
});

test("групповое занятие — по групповой цене; «не пришёл» оплачивается только по настройке", async () => {
  const t = await makeUser({ role: "TEACHER" });
  const s = await makeUser({ teacherId: t.id, lessonPriceRub: 2000, groupLessonPriceRub: 1200 } as never);
  await applyLessonStatus(t.id, await lesson(t.id, s.id, { groupLessonId: genId("gl") }), "done");
  await applyLessonStatus(t.id, await lesson(t.id, s.id, { groupLessonId: genId("gl") }), "missed");
  let b = (await getStudentBalance(t.id, s.id))!;
  assert.equal(b.balanceRub, -1200, "пропуск не оплачивается по умолчанию");
  assert.equal(b.chargedLessons, 1);
  await db.update(schema.users).set({ chargeMissed: true }).where(eq(schema.users.id, t.id));
  b = (await getStudentBalance(t.id, s.id))!;
  assert.equal(b.balanceRub, -2400);
  assert.equal(b.chargedLessons, 2);
});

test("две одновременные сессии задания — одна и та же", async () => {
  const s = await makeUser({ teacherId: "u_1" });
  const ps = await problems(2);
  const hw = await makeHomework({ studentId: s.id, teacherId: "u_1", problemIds: ps.map((p) => p.id), kind: "test" });
  const [a, b2, c] = await Promise.all([1, 2, 3].map(() => getOrCreateAssignmentSession(hw, s.id)));
  assert.equal(a.id, b2.id);
  assert.equal(b2.id, c.id);
});

test("энергия: параллельные списания не теряются", async () => {
  const s = await makeUser({ energy: 5, energyUpdatedAt: new Date() } as never);
  const results = await Promise.all([1, 2, 3].map(() => db.transaction((tx) => spendEnergy(tx, s.id))));
  assert.deepEqual(results, [true, true, true]);
  const [row] = await db.select({ e: schema.users.energy }).from(schema.users).where(eq(schema.users.id, s.id));
  assert.ok(Number(row.e) <= 2.01, `осталось ${row.e}, должно быть ≈2`);
});
