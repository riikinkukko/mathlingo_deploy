import { test, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db } from "../../lib/db/client";
import * as schema from "../../lib/db/schema";
import { performSubmitAttempt } from "../../lib/actions-core";
import { getHomeworksForStudent, homeworkStatus, getAssignmentDeadline, getTeacherHomeStats } from "../../lib/queries";
import { makeUser, makeHomework, problems, cleanup } from "../helpers";

after(cleanup);

async function setup() {
  const st = await makeUser({ teacherId: "u_1" });
  const [p1, p2, p3] = await problems(3);
  const testId = await makeHomework({ studentId: st.id, teacherId: "u_1", kind: "test", allowHints: false, timeLimitMinutes: 30, problemIds: [p1.id, p2.id] });
  const hwId = await makeHomework({ studentId: st.id, teacherId: "u_1", kind: "homework", allowHints: true, problemIds: [p3.id] });
  const hw = async (id: string) => (await getHomeworksForStudent(st.id)).find((h) => h.id === id)!;
  return { st, p1, p2, p3, testId, hwId, hw };
}

test("урок по задаче из идущей контрольной: подсказки нет, разбор закрыт, в контрольную не засчитывается", async () => {
  const { st, p1, testId, hw } = await setup();
  const wrong: any = await performSubmitAttempt(st, p1.id, "999999", "lesson");
  assert.equal(wrong.kind, "wrong");
  assert.equal(wrong.canRevealSolution, false);
  assert.match(wrong.hint, /подсказок к ней пока нет/);
  const ok: any = await performSubmitAttempt(st, p1.id, p1.correctAnswer, "lesson");
  assert.equal(ok.kind, "correct");
  assert.equal((await homeworkStatus(await hw(testId), st.id)).done, 0);
});

test("в контрольной без подсказок: сервер подсказку не отдаёт, таймер стартует от первого ответа", async () => {
  const { st, p1, p2, testId, hw } = await setup();
  const r: any = await performSubmitAttempt(st, p2.id, "999999", "assignment");
  assert.equal(r.hint, "");
  assert.equal(r.canRevealSolution, false);
  assert.ok(await getAssignmentDeadline(await hw(testId), st.id));
  const ok: any = await performSubmitAttempt(st, p1.id, p1.correctAnswer, "assignment");
  assert.equal(ok.kind, "correct");
  assert.equal((await homeworkStatus(await hw(testId), st.id)).done, 1);
});

test("после конца времени ответы в контрольной не принимаются и не засчитываются", async () => {
  const { st, p1, p2, testId, hw } = await setup();
  await performSubmitAttempt(st, p1.id, "999999", "assignment"); // стартуем отсчёт
  await db.update(schema.assignmentSessions).set({ startedAt: new Date(Date.now() - 31 * 60000) }).where(eq(schema.assignmentSessions.homeworkId, testId));
  const r: any = await performSubmitAttempt(st, p2.id, p2.correctAnswer, "assignment");
  assert.match(r.error, /вышло/);
  const status = await homeworkStatus(await hw(testId), st.id);
  assert.equal(status.done, 0);
});

test("обычная домашка: подсказки на месте, засчитывается любой верный ответ", async () => {
  const { st, p3, hwId, hw } = await setup();
  const r: any = await performSubmitAttempt(st, p3.id, "999999", "assignment");
  assert.ok(r.hint.length > 0);
  await performSubmitAttempt(st, p3.id, p3.correctAnswer, "lesson");
  assert.equal((await homeworkStatus(await hw(hwId), st.id)).complete, true);
});

test("сводка на главной репетитора совпадает с homeworkStatus", async () => {
  const { st, p1 } = await setup();
  await performSubmitAttempt(st, p1.id, p1.correctAnswer, "assignment");
  const m = await getTeacherHomeStats("u_1");
  const all = await getHomeworksForStudent(st.id);
  const sts = await Promise.all(all.map((h) => homeworkStatus(h, st.id)));
  assert.equal(m.get(st.id)!.pendingCount, sts.filter((s) => !s.complete).length);
  assert.equal(m.get(st.id)!.overdueCount, sts.filter((s) => !s.complete && s.overdue).length);
});

test("чужое задание: решать задачу в режиме задания нельзя", async () => {
  const other = await makeUser({ teacherId: "u_1" });
  const { p1 } = await setup();
  const r: any = await performSubmitAttempt(other, p1.id, p1.correctAnswer, "assignment");
  assert.ok("error" in r);
});
