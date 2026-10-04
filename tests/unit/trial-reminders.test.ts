import { test, after } from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { db } from "../../lib/db/client";
import * as schema from "../../lib/db/schema";
import { trialStageDue, trialMessage, sendTrialReminders } from "../../lib/trial-reminders";
import { makeUser, cleanup } from "../helpers";

after(cleanup);
const DAY = 86_400_000;
// 12:00 по Москве — внутри окна отправки
const NOW = new Date("2026-10-05T09:00:00Z");
const at = (days: number) => new Date(NOW.getTime() + days * DAY);

test("ступени напоминаний: 3 дня → последний день → закончился, без повторов", () => {
  assert.equal(trialStageDue(at(5), NOW, null), null);
  assert.equal(trialStageDue(at(2.5), NOW, null), "3d");
  assert.equal(trialStageDue(at(2.5), NOW, "3d"), null);
  assert.equal(trialStageDue(at(0.5), NOW, "3d"), "last");
  // воркер стоял — сразу последний день, без «3 дней»
  assert.equal(trialStageDue(at(0.5), NOW, null), "last");
  assert.equal(trialStageDue(at(0.5), NOW, "last"), null);
  assert.equal(trialStageDue(at(-1), NOW, "last"), "ended");
  assert.equal(trialStageDue(at(-1), NOW, "ended"), null);
  assert.equal(trialStageDue(at(-5), NOW, null), null);
});

test("текст зависит от числа учеников", () => {
  const many = trialMessage("3d", at(2.5), 7, NOW);
  assert.match(many.title, /ещё 3 дня/);
  assert.match(many.body, /7 учеников останутся с вами/);
  assert.equal(many.link, "/teacher/upgrade");
  const few = trialMessage("last", at(0.5), 2, NOW);
  assert.match(few.body, /ничего не изменится/);
  const none = trialMessage("3d", at(2.5), 0, NOW);
  assert.equal(none.link, "/teacher/students/new");
  // после окончания пишем только тем, у кого учеников больше лимита
  assert.equal(trialMessage("ended", at(-1), 3, NOW).send, false);
  assert.equal(trialMessage("ended", at(-1), 4, NOW).send, true);
});

test("рассылка: уведомление уходит один раз, оплатившим и вне окна — нет", async () => {
  const t = await makeUser({ role: "TEACHER", teacherTrialUntil: at(2.5) });
  for (let i = 0; i < 4; i++) await makeUser({ teacherId: t.id });
  const paid = await makeUser({ role: "TEACHER", teacherTrialUntil: at(2.5), teacherPlan: "pro", teacherTier: "standard", teacherProUntil: at(30) });

  // ночью ничего не шлём
  assert.equal(await sendTrialReminders(new Date("2026-10-04T23:00:00Z")), 0);

  await sendTrialReminders(NOW);
  await sendTrialReminders(NOW); // повтор не дублирует
  const notes = (id: string) =>
    db.select().from(schema.notifications).where(and(eq(schema.notifications.userId, id), eq(schema.notifications.type, "plan_reminder")));
  const mine = await notes(t.id);
  assert.equal(mine.length, 1);
  assert.match(mine[0].body, /4 ученика останутся/);
  assert.equal((await notes(paid.id)).length, 0);

  // последний день — второе уведомление, после окончания — третье
  await sendTrialReminders(new Date(NOW.getTime() + 2.2 * DAY));
  await sendTrialReminders(new Date(NOW.getTime() + 3 * DAY));
  const all = await notes(t.id);
  assert.equal(all.length, 3);
  assert.ok(all.some((n) => n.title === "Пробный период закончился"));
});
