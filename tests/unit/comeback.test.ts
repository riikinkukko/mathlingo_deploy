import { test, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db } from "../../lib/db/client";
import * as schema from "../../lib/db/schema";
import { comebackStageDue, comebackMessage, sendComebackEmails } from "../../lib/comeback-reminders";
import { makeUser, cleanup } from "../helpers";

after(cleanup);

test("ступени писем «возвращайся»: 1 → 2 → 3, без повторов и без догона", () => {
  assert.equal(comebackStageDue(5, 0), null);
  assert.equal(comebackStageDue(21, 0), 1);
  assert.equal(comebackStageDue(30, 1), null);
  assert.equal(comebackStageDue(70, 1), 2);
  assert.equal(comebackStageDue(170, 0), 3, "воркер стоял — сразу последняя наступившая");
  assert.equal(comebackStageDue(500, 3), null);
});

test("тексты: не начинал — зовём на первый урок; начинал — к своему уроку", () => {
  const a = comebackMessage(1, { name: "Маша Иванова", skillTitle: null, started: false });
  assert.match(a.subject, /^Маша,/);
  assert.match(a.title, /ещё не начал/);
  const b = comebackMessage(1, { name: "Маша", skillTitle: "Сумма углов", started: true });
  assert.match(b.body, /«Сумма углов»/);
});

test("ученику репетитора и с отключёнными письмами ничего не уходит", async () => {
  // SMTP в тестах не настроен — функция сразу возвращает 0 и ничего не трогает.
  const s = await makeUser({ role: "STUDENT" } as never);
  const sent = await sendComebackEmails(new Date("2026-10-05T15:00:00Z"));
  assert.equal(sent, 0);
  const [row] = await db.select({ st: schema.users.comebackStage }).from(schema.users).where(eq(schema.users.id, s.id));
  assert.equal(row.st, 0);
});
