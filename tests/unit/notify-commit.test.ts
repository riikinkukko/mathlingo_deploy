import { test, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../lib/db/client";
import { deliverWhenCommitted, pushNotification } from "../../lib/queries";
import { offlineAnswerTime, OFFLINE_ANSWER_MAX_AGE_MS } from "../../lib/actions-core";
import { makeUser, cleanup } from "../helpers";
import * as schema from "../../lib/db/schema";
import { eq } from "drizzle-orm";

after(cleanup);

test("уведомление: push/Telegram — только если запись сохранена, при откате — нет", async () => {
  const u = await makeUser();
  const p = { userId: u.id, title: "t", body: "b", link: "/student" };
  // Сохранённое уведомление — доставляется.
  await pushNotification(db, { ...p, type: "streak_frozen" });
  const [row] = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, u.id));
  assert.equal(await deliverWhenCommitted(row.id, p), true);
  // Откаченное — нет.
  assert.equal(await deliverWhenCommitted("n_never_committed", p), false);
});

test("время ответа без сети: только урок/повторение и не старше 3 суток", () => {
  const now = Date.now();
  const h = 3600_000;
  assert.equal(offlineAnswerTime(new Date(now - 10 * h), "lesson", now)?.getTime(), now - 10 * h);
  assert.equal(offlineAnswerTime(new Date(now - 10 * h), "review", now)?.getTime(), now - 10 * h);
  assert.equal(offlineAnswerTime(new Date(now - 10 * h), "assignment", now), null, "у ДЗ сроки — время сервера");
  assert.equal(offlineAnswerTime(new Date(now - OFFLINE_ANSWER_MAX_AGE_MS - h), "lesson", now), null);
  assert.equal(offlineAnswerTime(new Date(now + h), "lesson", now), null, "из будущего — нет");
  assert.equal(offlineAnswerTime(new Date(NaN), "lesson", now), null);
  assert.equal(offlineAnswerTime(undefined, "lesson", now), null);
});

test("ответ без сети вчера попадает во вчерашний день (серия)", async () => {
  const { performSubmitAttempt } = await import("../../lib/actions-core");
  const { getUserById } = await import("../../lib/queries");
  const u = await makeUser({ plan: "pro" });
  const [p] = await db.select().from(schema.problems).where(eq(schema.problems.id, "p_1"));
  const yesterday = new Date(Date.now() - 20 * 3600_000);
  const r = await performSubmitAttempt((await getUserById(u.id))!, p.id, p.correctAnswer, "lesson", null, { answeredAt: yesterday });
  assert.ok(!("error" in r));
  const [a] = await db.select().from(schema.attempts).where(eq(schema.attempts.studentId, u.id));
  assert.equal(a.createdAt.getTime(), yesterday.getTime());
});
