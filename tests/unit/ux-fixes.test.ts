import { test, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../lib/db/client";
import * as schema from "../../lib/db/schema";
import { needsEmailForMoreStudents, UNVERIFIED_STUDENT_LIMIT } from "../../lib/teacher-invites";
import { getParentVisibleBalance } from "../../lib/parent-balance";
import { computeOverallStats, computeProblemStates, getUserById } from "../../lib/queries";
import { makeUser, cleanup } from "../helpers";

after(cleanup);

test("репетитор без подтверждения почты: первые ученики — можно, дальше — нужна почта", () => {
  const t = { emailVerifiedAt: undefined, isPlatformOwner: false } as never;
  assert.equal(needsEmailForMoreStudents(t, 0, false), false);
  assert.equal(needsEmailForMoreStudents(t, UNVERIFIED_STUDENT_LIMIT - 1, false), false);
  assert.equal(needsEmailForMoreStudents(t, UNVERIFIED_STUDENT_LIMIT, false), true);
  assert.equal(needsEmailForMoreStudents(t, 10, true), false); // платный тариф
  assert.equal(needsEmailForMoreStudents({ emailVerifiedAt: "2026-01-01" } as never, 10, false), false);
});

test("родитель видит баланс, если репетитор ведёт оплаты ученика", async () => {
  const t = await makeUser({ role: "TEACHER" });
  const kid = await makeUser({ teacherId: t.id });
  assert.equal(await getParentVisibleBalance((await getUserById(kid.id))!), undefined);
  await db.insert(schema.studentPayments).values({ id: `sp_${kid.id}`, teacherId: t.id, studentId: kid.id, amountRub: 4000, lessonsCount: 4, paidAt: "2026-11-01" } as never);
  const b = await getParentVisibleBalance((await getUserById(kid.id))!);
  assert.ok(b);
  assert.equal(b!.paidLessons, 4);
});

test("неверная попытка помечает задачу как «уже пробовал» (повтор не тратит энергию)", async () => {
  const s = await makeUser();
  const [p] = await db.select().from(schema.problems).limit(1);
  await db.insert(schema.attempts).values({ id: `at_${s.id}`, studentId: s.id, problemId: p.id, answer: "0", isCorrect: false, source: "lesson" } as never);
  const st = await computeProblemStates(s.id, [{ ...p, answerType: "NUMBER" } as never]);
  assert.equal(st[p.id].status, "unsolved");
  assert.equal(st[p.id].attempted, true);
  const stats = await computeOverallStats(s.id);
  assert.equal(stats.activeDaysLast7, 1);
});
