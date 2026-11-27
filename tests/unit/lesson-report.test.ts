import { handleTelegramUpdate } from "../../lib/telegram-updates";
import { generateTelegramLinkCode, linkTelegramAccountByCode, unlinkTelegramAccount } from "../../lib/queries";
import { boundTelegramCallback } from "../../lib/telegram-binding";
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
  assert.equal(await handleTelegramReportText(chat, "привет", 100), false);

  assert.equal(await startTelegramReport(t.id, { chatId: chat, version: t.telegramBindingVersion! }, l, async () => 100), "Жду текст отчёта");
  assert.equal(await handleTelegramReportText(chat, "Разобрали формулы приведения, всё понял.", 100), true);
  const logs = await db.select().from(schema.lessonLogs).where(eq(schema.lessonLogs.lessonId, l));
  assert.equal(logs.length, 1);
  assert.equal(logs[0].topic, "Тригонометрия");
  assert.match(logs[0].report, /^Разобрали формулы приведения/);
  assert.equal((await getUserById(t.id)) && (await db.select().from(schema.users).where(eq(schema.users.id, t.id)))[0].tgReportLessonId, null);

  // Повторно по тому же занятию — уже есть.
  assert.equal(await startTelegramReport(t.id, { chatId: chat, version: t.telegramBindingVersion! }, l, async () => 100), "Отчёт об этом занятии уже есть");

  // Ожидание истекает через 6 часов.
  const l2 = await lesson(t.id, s.id);
  await startTelegramReport(t.id, { chatId: chat, version: t.telegramBindingVersion! }, l2, async () => 101);
  assert.equal(await handleTelegramReportText(chat, "поздно", 101, new Date(Date.now() + 7 * 3600_000)), false);
  assert.equal((await db.select().from(schema.lessonLogs).where(eq(schema.lessonLogs.lessonId, l2))).length, 0);

  // /cancel — отмена.
  await startTelegramReport(t.id, { chatId: chat, version: t.telegramBindingVersion! }, l2, async () => 101);
  assert.equal(await handleTelegramReportText(chat, "/cancel", 101), true);
  assert.equal(await handleTelegramReportText(chat, "текст", 101), false);
});

test("Telegram gateway correlates prompt replies and claims retries once", async () => {
  const chatId = "692341";
  let teacher = await makeUser({ role: "TEACHER", telegramChatId: chatId });
  const student = await makeUser({ teacherId: teacher.id });
  const firstLesson = await lesson(teacher.id, student.id, { topic: "First fixture" });
  const nextLesson = await lesson(teacher.id, student.id, { topic: "Next fixture" });
  const base = 1700000000 + Math.floor(Math.random() * 100000000);
  let lastPromptId = 100;
  let rejectPrompt = false;
  const fetchBefore = globalThis.fetch;
  const tokenBefore = process.env.TELEGRAM_BOT_TOKEN;
  const effects: string[] = [];
  process.env.TELEGRAM_BOT_TOKEN = "fixture-token";
  globalThis.fetch = (async (url, init) => {
    const method = String(url).split("/").at(-1)!;
    effects.push(method);
    if (method === "sendMessage" && JSON.parse(String(init?.body)).reply_markup?.force_reply) {
      if (rejectPrompt) return new Response(JSON.stringify({ ok: false }), { status: 400 });
      return Response.json({ ok: true, result: { message_id: ++lastPromptId } });
    }
    return Response.json({ ok: true });
  }) as typeof fetch;
  const chat = { id: Number(chatId), type: "private" };
  const from = { id: chat.id };
  const button = (number: number, lessonId: string) => ({
    update_id: base + number,
    callback_query: { id: String(number), from, message: { chat }, data: boundTelegramCallback("rp:" + lessonId, teacher.telegramBindingVersion!) },
  });
  const message = (number: number, text: string, promptId?: number) => ({
    update_id: base + number,
    message: { chat, from, text, reply_to_message: promptId ? { message_id: promptId } : undefined },
  });
  const currentPrompt = async () => (await db.select().from(schema.users).where(eq(schema.users.id, teacher.id)))[0].tgReportPromptId;
  try {
    const opening = button(1, firstLesson);
    await Promise.all([handleTelegramUpdate(opening), handleTelegramUpdate(opening)]);
    const oldPrompt = lastPromptId;
    assert.equal(oldPrompt, 101);
    assert.equal(await currentPrompt(), oldPrompt);

    await unlinkTelegramAccount(teacher.id);
    assert.equal(await linkTelegramAccountByCode(await generateTelegramLinkCode(teacher.id), chatId), true);
    teacher = (await getUserById(teacher.id))!;
    await handleTelegramUpdate({ ...opening, update_id: base + 2 });
    assert.equal(await currentPrompt(), null);

    await handleTelegramUpdate(button(3, nextLesson));
    const nextPrompt = lastPromptId;
    const beforeIgnored = effects.length;
    await handleTelegramUpdate(message(4, "Earlier report", oldPrompt));
    await handleTelegramUpdate(message(5, "/cancel", oldPrompt));
    await handleTelegramUpdate(message(6, "/cancel"));
    assert.equal(effects.length, beforeIgnored);
    assert.equal(await currentPrompt(), nextPrompt);

    rejectPrompt = true;
    await handleTelegramUpdate(button(7, nextLesson));
    assert.equal(await currentPrompt(), nextPrompt);
    rejectPrompt = false;
    const cancel = message(8, "/cancel", nextPrompt);
    await handleTelegramUpdate(cancel);
    assert.equal(await currentPrompt(), null);

    const reopened = button(9, nextLesson);
    await handleTelegramUpdate(reopened);
    const finalPrompt = lastPromptId;
    await handleTelegramUpdate(cancel);
    await handleTelegramUpdate(message(10, "Earlier attempt in the current binding", nextPrompt));
    assert.equal(await currentPrompt(), finalPrompt);
    const reply = message(11, "Current report", finalPrompt);
    await Promise.all([handleTelegramUpdate(reply), handleTelegramUpdate(reply),
      handleTelegramUpdate({ ...reply, update_id: base + 12 })]);
    await handleTelegramUpdate(reopened);
    assert.equal(await currentPrompt(), null);
    const reports = await db.select().from(schema.lessonLogs).where(eq(schema.lessonLogs.studentId, student.id));
    assert.equal(reports.length, 1);
    assert.equal(reports[0].lessonId, nextLesson);
    assert.match(reports[0].report, /^Current report/);
  } finally {
    globalThis.fetch = fetchBefore;
    if (tokenBefore === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = tokenBefore;
    for (let i = 1; i <= 12; i++) await db.delete(schema.telegramUpdates).where(eq(schema.telegramUpdates.id, base + i));
  }
});
