import { test, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../lib/db/client";
import * as schema from "../../lib/db/schema";
import { eq } from "drizzle-orm";
import { canStudentAccessProblem, isParentOf, getProblem } from "../../lib/queries";
import { applyLessonStatus } from "../../lib/lesson-status";
import { nudgeStudent } from "../../lib/nudge";
import { makeUser, cleanup } from "../helpers";

after(cleanup);

test("родитель видит только своих детей", async () => {
  assert.equal(await isParentOf("u_8", "u_2"), true);
  assert.equal(await isParentOf("u_8", "u_4"), false);
});

test("бесплатный ученик без репетитора не решает развёрнутые и закрытые задачи", async () => {
  const free = await makeUser({ plan: "free" } as any);
  const detailed = (await db.select().from(schema.problems).where(eq(schema.problems.answerType, "DETAILED")).limit(1))[0];
  if (detailed) assert.equal(await canStudentAccessProblem(free, detailed as any, "lesson"), false);
  const first = (await getProblem((await db.select().from(schema.problems).where(eq(schema.problems.skillId, "sk_1")).limit(1))[0].id))!;
  assert.equal(await canStudentAccessProblem(free, first, "lesson"), true);
});

test("репетитор не отмечает чужое занятие и не напоминает чужому ученику", async () => {
  const otherTeacher = await makeUser({ role: "TEACHER" });
  const lessonId = `tl_${otherTeacher.id}`;
  await db.insert(schema.scheduledLessons).values({ id: lessonId, teacherId: "u_1", studentId: "u_2", startsAt: new Date(Date.now() - 7200000), durationMin: 60, status: "planned" } as any);
  try {
    const r = await applyLessonStatus(otherTeacher.id, lessonId, "done");
    assert.equal(r.ok, false);
    const n = await nudgeStudent(otherTeacher.id, "u_2");
    assert.equal(n.ok, false);
  } finally {
    await db.delete(schema.scheduledLessons).where(eq(schema.scheduledLessons.id, lessonId));
  }
});

test("«Напомнить»: не чаще раза в сутки", async () => {
  const st = await makeUser({ teacherId: "u_1" });
  const a = await nudgeStudent("u_1", st.id);
  const b = await nudgeStudent("u_1", st.id);
  assert.equal(a.ok, true);
  assert.equal(b.ok, false);
});
