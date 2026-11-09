import { test, after } from "node:test";
import assert from "node:assert/strict";
import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "../../lib/db/client";
import * as schema from "../../lib/db/schema";
import { getMistakePractice, getNumberPractice } from "../../lib/practice";
import { computeDailyGoal, getUserById } from "../../lib/queries";
import { makeUser, problems, attempt, cleanup, mskDay } from "../helpers";

after(cleanup);

test("работа над ошибками: берёт только нерешённые ошибки, решённая потом — уходит", async () => {
  const u = await makeUser({ plan: "pro" });
  const [p1, p2] = await problems(2);
  await attempt(u.id, p1.id, false, mskDay(-2));
  await attempt(u.id, p2.id, false, mskDay(-2));
  await attempt(u.id, p2.id, true, mskDay(-1)); // p2 потом решил верно
  const r = await getMistakePractice(u);
  assert.deepEqual(
    r.items.map((i) => i.problem.id),
    [p1.id]
  );
  assert.equal(r.unresolved, 1);
});

test("работа над ошибками: Free без репетитора не получает закрытые в Free задачи", async () => {
  const u = await makeUser({ plan: "free" });
  // Навык не первой главы и не первый в главе — на Free закрыт.
  const [locked] = (await db.execute(sql`
    select p.id from problems p
    join skills s on s.id = p.skill_id
    join subtopics c on c.id = s.subtopic_id
    where p.answer_type = 'NUMBER' and c."order" > 1
      and s."order" > (select min(s2."order") from skills s2 where s2.subtopic_id = s.subtopic_id)
    limit 1`)).rows as { id: string }[];
  assert.ok(locked, "в демо-данных есть задача из закрытого на Free навыка");
  await attempt(u.id, locked.id, false, mskDay(-1));
  const r = await getMistakePractice(u);
  assert.equal(r.items.length, 0);
  assert.equal(r.locked, 1);
});

test("тренировка по номеру: только этот номер, без развёрнутых, сначала нерешённые", async () => {
  const u = await makeUser({ plan: "pro" });
  const [row] = await db
    .select({ n: schema.problems.egeTaskNumber })
    .from(schema.problems)
    .where(and(isNotNull(schema.problems.egeTaskNumber), isNotNull(schema.problems.skillId), ne(schema.problems.answerType, "DETAILED")))
    .groupBy(schema.problems.egeTaskNumber)
    .having(sql`count(*) > 10`)
    .limit(1);
  const n = row.n!;
  const pool = await db.select().from(schema.problems).where(and(eq(schema.problems.egeTaskNumber, n), ne(schema.problems.answerType, "DETAILED")));
  // Решаем верно все задачи, кроме двух.
  const unsolved = pool.slice(0, 2).map((p) => p.id);
  for (const p of pool.slice(2)) await attempt(u.id, p.id, true, mskDay(-1));
  const r = await getNumberPractice(u, n);
  assert.ok(r.items.length > 2);
  assert.ok(r.items.every((i) => i.problem.egeTaskNumber === n && i.problem.answerType !== "DETAILED"));
  assert.deepEqual(new Set(r.items.slice(0, 2).map((i) => i.problem.id)), new Set(unsolved.filter((id) => pool.find((p) => p.id === id)?.skillId)));
});

test("цель дня считается по московскому дню: задача в 01:30 МСК — сегодня", async () => {
  const u = await makeUser();
  const [p] = await problems(1);
  const at = mskDay(0, "01:30");
  if (at.getTime() > Date.now()) return; // до 01:30 МСК проверять нечего
  await attempt(u.id, p.id, true, at);
  const g = await computeDailyGoal(u.id);
  assert.equal(g.done, 1);
  assert.ok(await getUserById(u.id));
});
