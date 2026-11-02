import { test, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db } from "../../lib/db/client";
import * as schema from "../../lib/db/schema";
import { buildEveningReminder, sendStudentEveningReminders } from "../../lib/student-reminders";
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

test("вечернее напоминание: текст без HTML-экранирования, заголовок для push", async () => {
  const u = await makeUser({ teacherId: "u_1", name: "Аня <b>" });
  const [p] = await problems(1);
  await attempt(u.id, p.id, true, mskDay(-2));
  await attempt(u.id, p.id, true, mskDay(-1));
  const r = await buildEveningReminder(u, at19());
  assert.ok(r);
  assert.match(r!.text, /Аня/);
  assert.ok(!r!.text.includes("&lt;"));
  assert.match(r!.title, /Серия 2 дня/);
});

test("вечернее напоминание: ученик только с приложением (без Telegram) тоже в рассылке", async () => {
  const u = await makeUser({ teacherId: "u_1" });
  const [p] = await problems(1);
  await attempt(u.id, p.id, true, mskDay(-1));
  await db.insert(schema.pushTokens).values({ token: `ExponentPushToken[r${Date.now()}]`, userId: u.id, platform: "android" });
  const off = await makeUser({ teacherId: "u_1", tgStudentReminders: false });
  await db.insert(schema.pushTokens).values({ token: `ExponentPushToken[o${Date.now()}]`, userId: off.id, platform: "android" });
  await sendStudentEveningReminders(at19());
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, u.id));
  assert.ok(row.eveningRemindedOn, "ученик с приложением отмечен как проверенный сегодня");
  const [rowOff] = await db.select().from(schema.users).where(eq(schema.users.id, off.id));
  assert.equal(rowOff.eveningRemindedOn, null, "выключил напоминания — не трогаем");
});
