import { test, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db } from "../../lib/db/client";
import * as schema from "../../lib/db/schema";
import { applyLessonStatus } from "../../lib/lesson-status";
import { canStudentAccessProblem, genId, getCurriculum, gateCurriculumForUser } from "../../lib/queries";
import { mskEndOfDay, lessonWhenLabel, mondayOf, addDaysKey } from "../../lib/lesson-time";
import { makeUser, cleanup } from "../helpers";

after(cleanup);

test("срок сдачи — конец дня по Москве, а не полночь UTC", () => {
  assert.equal(mskEndOfDay("2026-10-10").toISOString(), "2026-10-10T20:59:00.000Z");
});

test("подписи занятий и недели", () => {
  const now = new Date("2026-10-04T10:00:00+03:00");
  assert.equal(lessonWhenLabel("2026-10-04T15:00:00+03:00", 90, now), "Сегодня · 15:00–16:30");
  assert.equal(lessonWhenLabel("2026-10-05T00:30:00+03:00", 60, now), "Завтра · 00:30–01:30");
  assert.equal(mondayOf("2026-10-04"), "2026-09-28"); // воскресенье → понедельник той же недели
  assert.equal(mondayOf("2026-10-05"), "2026-10-05");
  assert.equal(addDaysKey("2026-12-29", 7), "2027-01-05");
});

test("повторная отметка «было» ничего не меняет и не считается новой", async () => {
  const t = await makeUser({ role: "TEACHER" });
  const s = await makeUser({ teacherId: t.id });
  const id = genId("sl");
  await db.insert(schema.scheduledLessons).values({ id, teacherId: t.id, studentId: s.id, startsAt: new Date(), durationMin: 60 });
  assert.equal((await applyLessonStatus(t.id, id, "done")).ok, true);
  // onlyIfPlanned (Telegram / групповая отметка) — уже отмеченное не трогаем
  const again = await applyLessonStatus(t.id, id, "cancelled", { onlyIfPlanned: true });
  assert.equal(again.ok, false);
  const [row] = await db.select({ s: schema.scheduledLessons.status }).from(schema.scheduledLessons).where(eq(schema.scheduledLessons.id, id));
  assert.equal(row.s, "done");
  // Чужой репетитор не может отметить
  const other = await makeUser({ role: "TEACHER" });
  assert.equal((await applyLessonStatus(other.id, id, "cancelled")).ok, false);
});

test("авторская задача репетитора без навыка: в уроке недоступна, в задании — только своему ученику", async () => {
  const s = await makeUser({ teacherId: "u_1" });
  const p = { id: genId("p"), skillId: undefined, answerType: "NUMBER" };
  assert.equal(await canStudentAccessProblem(s, p, "lesson"), false);
  assert.equal(await canStudentAccessProblem(s, p, "review"), false);
  assert.equal(await canStudentAccessProblem(s, p, "assignment"), false);
});

test("Free-ученик не получает платную теорию через API", async () => {
  const free = await makeUser({ name: "Free" });
  const cur = gateCurriculumForUser(free, await getCurriculum());
  const skills = cur.flatMap((t) => t.chapters.flatMap((c) => c.skills));
  assert.ok(skills.some((s) => (s as { locked?: boolean }).locked), "есть закрытые навыки");
  assert.ok(skills.filter((s) => (s as { locked?: boolean }).locked).every((s) => s.theoryCards.length === 0));
});
