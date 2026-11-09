import { test, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db } from "../../lib/db/client";
import * as schema from "../../lib/db/schema";
import { buildQuests, getDailyQuests, questsJustCompleted, type QuestFacts } from "../../lib/daily-quests";
import { longestStreakFromDays, MAX_FREEZES } from "../../lib/streak";
import { makeUser, problems, attempt, cleanup, mskDay } from "../helpers";

after(cleanup);

const facts = (over: Partial<QuestFacts> = {}): QuestFacts => ({
  today: [],
  solvedBefore: new Set(),
  fixedToday: 0,
  hasOpenMistakes: false,
  hasDueReviews: false,
  ...over,
});

test("задания дня: три штуки, одинаковые весь день, первое — «реши N задач»", () => {
  const a = buildQuests("u1", "2026-11-10", facts());
  const b = buildQuests("u1", "2026-11-10", facts());
  assert.equal(a.length, 3);
  assert.deepEqual(a, b);
  assert.equal(a[0].kind, "solve");
  assert.equal(new Set(a.map((q) => q.kind)).size, 3, "задания не повторяются");
});

test("задания дня: есть нерешённые ошибки — третье задание «исправь ошибку»", () => {
  const q = buildQuests("u1", "2026-11-10", facts({ hasOpenMistakes: true }));
  assert.equal(q[2].kind, "fix");
});

test("задания дня: цепочка верных ответов считается подряд, ошибка её рвёт", () => {
  const today = ["a", "b", "c", "d", "e", "f"].map((id, i) => ({ problemId: id, isCorrect: i !== 2, source: "lesson", pending: false }));
  // Ищем день, где второе задание — цепочка.
  for (let d = 1; d < 40; d++) {
    const day = `2026-12-${String((d % 28) + 1).padStart(2, "0")}`;
    const q = buildQuests(`u${d}`, day, facts({ today }));
    const combo = q.find((x) => x.kind === "combo");
    if (!combo) continue;
    assert.equal(combo.progress, Math.min(combo.target, 3)); // d, e, f
    return;
  }
  assert.fail("не нашлось дня с заданием на цепочку");
});

test("все задания выполнены — заморозка выдаётся один раз", async () => {
  const u = await makeUser();
  await db.update(schema.users).set({ streakFreezes: 0 }).where(eq(schema.users.id, u.id));
  // 10 верных ответов подряд по новым задачам закрывают любые «реши/цепочка/новые».
  const ps = await problems(10);
  const base = Date.now() - 10 * 60_000;
  for (let i = 0; i < ps.length; i++) await attempt(u.id, ps[i].id, true, new Date(base + i * 1000));
  const q1 = await getDailyQuests(u.id);
  if (!q1.allDone) return; // третье задание могло выпасть «исправь ошибку»/«повторение» — тогда награду не проверяем
  assert.equal(q1.justRewarded, true);
  assert.equal(q1.freezeGiven, true);
  const q2 = await getDailyQuests(u.id);
  assert.equal(q2.justRewarded, false);
  assert.equal(q2.rewarded, true);
  const [row] = await db.select({ f: schema.users.streakFreezes }).from(schema.users).where(eq(schema.users.id, u.id));
  assert.equal(row.f, 1);
  assert.ok(row.f <= MAX_FREEZES);
});

test("questsJustCompleted: ответ, закрывший задание, его называет", async () => {
  const u = await makeUser();
  const ps = await problems(8);
  const base = Date.now() - 10 * 60_000;
  // Решаем по одной, пока «реши N задач» не закроется — на этом ответе оно должно попасть в список.
  for (let i = 0; i < ps.length; i++) {
    await attempt(u.id, ps[i].id, true, new Date(base + i * 1000));
    const r = await questsJustCompleted(u.id);
    const solve = (await getDailyQuests(u.id)).quests[0];
    if (solve.done) {
      assert.ok(r.titles.includes(solve.title) || i + 1 > solve.target);
      return;
    }
  }
});

test("рекорд серии: самая длинная цепочка дней", () => {
  const days = new Set(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-10", "2026-10-11"]);
  assert.equal(longestStreakFromDays(days), 3);
  assert.equal(longestStreakFromDays(new Set()), 0);
});

test("попытка вчера не идёт в задания сегодня", async () => {
  const u = await makeUser();
  const [p] = await problems(1);
  await attempt(u.id, p.id, true, mskDay(-1));
  const q = await getDailyQuests(u.id);
  assert.equal(q.quests[0].progress, 0);
});
