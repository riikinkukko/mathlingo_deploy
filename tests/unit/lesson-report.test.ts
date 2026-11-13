import { test, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db } from "../../lib/db/client";
import * as schema from "../../lib/db/schema";
import { getUserById } from "../../lib/queries";
import {
  buildReportDraft,
  cleanReport,
  createLessonReport,
  getUnreportedLessons,
  handleTelegramReportText,
  mskDay,
  startTelegramReport,
} from "../../lib/lesson-report";
import { makeUser, cleanup } from "../helpers";

after(cleanup);

let n = 0;
async function lesson(teacherId: string, studentId: string, over: Partial<typeof schema.scheduledLessons.$inferInsert> = {}) {
  const id = `tl_${Date.now()}_${++n}`;
  await db.insert(schema.scheduledLessons).values({
    id,
    teacherId,
    studentId,
    startsAt: new Date(Date.now() - 3 * 3600_000),
    durationMin: 60,
    status: "done",
    ...over,
  } as typeof schema.scheduledLessons.$inferInsert);
  return id;
}

test("cleanReport: незаполненные строки шаблона убираются, текст остаётся", () => {
  assert.equal(cleanReport("Что делали: Параметры\nПолучилось: \nПоработать над:\n\nДомашка: X."), "Что делали: Параметры\n\nДомашка: X.");
});

test("черновик: тема занятия, домашка, практика, следующее занятие", async () => {
  const t = await makeUser({ role: "TEACHER" });
  const s = await makeUser({ teacherId: t.id });
  const l = await lesson(t.id, s.id, { topic: "Параметры" });
  await lesson(t.id, s.id, { status: "planned", startsAt: new Date(Date.now() + 2 * 86_400_000) });
  await db.insert(schema.homeworks).values({
    id: `th_${l}`,
    teacherId: t.id,
    studentId: s.id,
    title: "ДЗ по параметрам",
    kind: "homework",
    allowHints: true,
    problemIds: ["a", "b", "c"],
    dueDate: new Date(Date.now() + 5 * 86_400_000),
  } as typeof schema.homeworks.$inferInsert);
  const d = await buildReportDraft(t.id, s.id, l);
  assert.equal(d.topic, "Параметры");
  assert.match(d.report, /^Что делали: Параметры\nПолучилось: \nПоработать над: /);
  assert.ok(d.facts.some((f) => f.startsWith("Домашка: ДЗ по параметрам (3 задачи)")), d.facts.join("|"));
  assert.ok(d.facts.some((f) => f.startsWith("Следующее занятие:")));
  // Чужое занятие в черновик не подставляется.
  const other = await makeUser({ role: "TEACHER" });
  assert.equal((await buildReportDraft(other.id, s.id, l)).topic, "");
});

test("отчёт к занятию: один раз, только свой ученик; занятие пропадает из «без отчёта»", async () => {
  const t = await makeUser({ role: "TEACHER" });
  const s = await makeUser({ teacherId: t.id });
  const l = await lesson(t.id, s.id);
  assert.deepEqual((await getUnreportedLessons(t.id)).map((x) => x.id), [l]);

  const base = { teacherId: t.id, studentId: s.id, date: mskDay(new Date()), topic: "Тема", report: "Получилось: всё", lessonId: l };
  assert.deepEqual(await createLessonReport({ ...base, teacherId: (await makeUser({ role: "TEACHER" })).id }), { ok: false, reason: "access" });
  assert.deepEqual(await createLessonReport({ ...base, report: "Получилось: " }), { ok: false, reason: "empty" });
  const r = await createLessonReport(base);
  assert.ok(r.ok);
  assert.deepEqual(await createLessonReport(base), { ok: false, reason: "exists" });
  assert.deepEqual(await getUnreportedLessons(t.id), []);
  const notes = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, s.id));
  assert.equal(notes.filter((x) => x.type === "lesson_log_added").length, 1);
});

test("Telegram: кнопка «Написать отчёт» → следующее сообщение становится отчётом", async () => {
  const chat = `chat_${Date.now()}`;
  const t = await makeUser({ role: "TEACHER", telegramChatId: chat });
  const s = await makeUser({ teacherId: t.id });
  const l = await lesson(t.id, s.id, { topic: "Тригонометрия" });

  // Бот ничего не ждёт — обычное сообщение не трогаем.
  assert.equal(await handleTelegramReportText(chat, "привет"), false);

  assert.equal(await startTelegramReport(t.id, chat, l), "Жду текст отчёта");
  assert.equal(await handleTelegramReportText(chat, "Разобрали формулы приведения, всё понял."), true);
  const logs = await db.select().from(schema.lessonLogs).where(eq(schema.lessonLogs.lessonId, l));
  assert.equal(logs.length, 1);
  assert.equal(logs[0].topic, "Тригонометрия");
  assert.match(logs[0].report, /^Разобрали формулы приведения/);
  assert.equal((await getUserById(t.id)) && (await db.select().from(schema.users).where(eq(schema.users.id, t.id)))[0].tgReportLessonId, null);

  // Повторно по тому же занятию — уже есть.
  assert.equal(await startTelegramReport(t.id, chat, l), "Отчёт об этом занятии уже есть");

  // Ожидание истекает через 6 часов.
  const l2 = await lesson(t.id, s.id);
  await startTelegramReport(t.id, chat, l2);
  assert.equal(await handleTelegramReportText(chat, "поздно", new Date(Date.now() + 7 * 3600_000)), false);
  assert.equal((await db.select().from(schema.lessonLogs).where(eq(schema.lessonLogs.lessonId, l2))).length, 0);

  // /cancel — отмена.
  await startTelegramReport(t.id, chat, l2);
  assert.equal(await handleTelegramReportText(chat, "/cancel"), true);
  assert.equal(await handleTelegramReportText(chat, "текст"), false);
});
