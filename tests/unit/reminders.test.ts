import { test, after } from "node:test";
import assert from "node:assert/strict";
import { buildEveningReminder } from "../../lib/student-reminders";
import { makeUser, makeHomework, problems, attempt, cleanup, mskDay } from "../helpers";

after(cleanup);
const at19 = () => new Date(mskDay(0, "19:05").getTime());

test("вечернее напоминание: молчит, если ученик уже занимался сегодня", async () => {
  const u = await makeUser({ teacherId: "u_1" });
  const [p] = await problems(1);
  await attempt(u.id, p.id, true, mskDay(-1));
  await attempt(u.id, p.id, true, mskDay(0, "10:00"));
  assert.equal(await buildEveningReminder(u, at19()), null);
});

test("вечернее напоминание: про серию, если вчера занимался, а сегодня нет", async () => {
  const u = await makeUser({ teacherId: "u_1" });
  const [p] = await problems(1);
  await attempt(u.id, p.id, true, mskDay(-1));
  const r = await buildEveningReminder(u, at19());
  assert.ok(r);
  assert.match(r!.text, /сери/);
});

test("вечернее напоминание: про домашку со сроком завтра", async () => {
  const u = await makeUser({ teacherId: "u_1" });
  const ps = await problems(2);
  const hw = await makeHomework({ studentId: u.id, teacherId: "u_1", problemIds: ps.map((p) => p.id), dueDate: mskDay(1, "21:00") });
  const r = await buildEveningReminder(u, at19());
  assert.ok(r);
  assert.match(r!.text, /осталось 2 задачи/);
  assert.equal(r!.link, `/student/homework/${hw}`);
});

test("вечернее напоминание: новичку без серии и домашки не пишем", async () => {
  const u = await makeUser({ teacherId: "u_1" });
  assert.equal(await buildEveningReminder(u, at19()), null);
});
