import { test, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db } from "../../lib/db/client";
import * as schema from "../../lib/db/schema";
import { settleStreak } from "../../lib/streak";
import { makeUser, problems, attempt, cleanup, mskDay } from "../helpers";

after(cleanup);
const setFreezes = (id: string, n: number) =>
  db.update(schema.users).set({ streakFreezes: n, freezeAwardedOn: null }).where(eq(schema.users.id, id));

test("серия считается по московскому дню (занятие в 01:30 — сегодня)", async () => {
  const u = await makeUser();
  const [p] = await problems(1);
  await attempt(u.id, p.id, true, mskDay(0, "01:30"));
  await attempt(u.id, p.id, true, mskDay(-1));
  const r = await settleStreak(u.id);
  assert.equal(r.streak, 2);
  assert.equal(r.activeToday, true);
});

test("пропуск 2 дней при одной заморозке — серия прерывается, заморозка цела", async () => {
  const u = await makeUser();
  const [p] = await problems(1);
  await setFreezes(u.id, 1);
  for (const d of [-5, -4, -3]) await attempt(u.id, p.id, true, mskDay(d));
  const r = await settleStreak(u.id);
  assert.equal(r.streak, 0);
  assert.equal(r.freezes, 1);
});

test("пропуск 2 дней при двух заморозках — оба дня спасены, повтор ничего не тратит", async () => {
  const u = await makeUser();
  const [p] = await problems(1);
  await setFreezes(u.id, 2);
  for (const d of [-5, -4, -3]) await attempt(u.id, p.id, true, mskDay(d));
  let r = await settleStreak(u.id);
  assert.equal(r.streak, 5);
  assert.equal(r.freezes, 0);
  r = await settleStreak(u.id);
  assert.equal(r.streak, 5);
  assert.equal(r.freezes, 0);
});

test("параллельные подсчёты тратят заморозку ровно один раз", async () => {
  const u = await makeUser();
  const [p] = await problems(1);
  await setFreezes(u.id, 1);
  await attempt(u.id, p.id, true, mskDay(-3));
  await attempt(u.id, p.id, true, mskDay(-2));
  await Promise.all([1, 2, 3, 4, 5].map(() => settleStreak(u.id)));
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, u.id));
  const days = await db.select().from(schema.streakFreezeDays).where(eq(schema.streakFreezeDays.studentId, u.id));
  assert.equal(row.streakFreezes, 0);
  assert.equal(days.length, 1);
});

test("7 дней подряд — +1 заморозка, не больше двух, не дважды за день", async () => {
  const u = await makeUser();
  const [p] = await problems(1);
  await setFreezes(u.id, 0);
  for (let d = -6; d <= 0; d++) await attempt(u.id, p.id, true, mskDay(d));
  assert.equal((await settleStreak(u.id)).freezes, 1);
  assert.equal((await settleStreak(u.id)).freezes, 1);
  await setFreezes(u.id, 2);
  assert.equal((await settleStreak(u.id)).freezes, 2);
});
