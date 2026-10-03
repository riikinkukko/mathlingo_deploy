import { test, after } from "node:test";
import assert from "node:assert/strict";
import { eq, sql } from "drizzle-orm";
import { db } from "../../lib/db/client";
import * as schema from "../../lib/db/schema";
import { collapseGroupLessons } from "../../lib/lesson-collapse";
import { lessonTimeRange, durationLabel } from "../../lib/lesson-time";
import { pickByNumbers } from "../../lib/quick-homework";
import { getGroupsOfTeacher } from "../../lib/groups";
import { sendLessonStatusPrompts, handleCallbackQuery } from "../../lib/teacher-telegram";
import { makeUser, attempt, cleanup } from "../helpers";

after(cleanup);

test("время занятия: диапазон и длительность", () => {
  assert.equal(lessonTimeRange("2026-10-05T12:00:00Z", 90), "15:00–16:30");
  assert.equal(durationLabel(45), "45 мин");
  assert.equal(durationLabel(60), "1 ч");
  assert.equal(durationLabel(90), "1 ч 30 мин");
});

test("сворачивание групповых занятий: одна карточка, статус по посещаемости", () => {
  const base = { groupName: "10А", studentName: "" };
  const rows = [
    { ...base, id: "a1", studentId: "s1", studentName: "Борис", status: "done" as const, groupLessonId: "g1" },
    { ...base, id: "x", studentId: "s9", studentName: "Инд", status: "planned" as const, groupLessonId: null },
    { ...base, id: "a2", studentId: "s2", studentName: "Анна", status: "cancelled" as const, groupLessonId: "g1" },
    { ...base, id: "b1", studentId: "s1", studentName: "Борис", status: "cancelled" as const, groupLessonId: "g2" },
  ];
  const out = collapseGroupLessons(rows);
  assert.deepEqual(out.map((o) => o.id), ["a1", "x", "b1"]);
  assert.deepEqual(out[0].members!.map((m) => m.studentName), ["Анна", "Борис"]);
  assert.equal(out[0].status, "done"); // кто-то был
  assert.equal(out[2].status, "cancelled"); // никого не было
  assert.equal(out[1].members, undefined);
});

test("группа: открепленный ученик выпадает из состава", async () => {
  const t = await makeUser({ role: "TEACHER" });
  const a = await makeUser({ teacherId: t.id, name: "Анна" });
  const b = await makeUser({ teacherId: t.id, name: "Борис" });
  const gone = await makeUser({ name: "Ушёл" }); // не ученик этого репетитора
  await db.insert(schema.studentGroups).values({ id: `grp_${t.id}`, teacherId: t.id, name: "10А" });
  await db.insert(schema.studentGroupMembers).values([a, b, gone].map((s) => ({ groupId: `grp_${t.id}`, studentId: s.id })));
  const [g] = await getGroupsOfTeacher(t.id);
  assert.deepEqual(g.members.map((m) => m.name), ["Анна", "Борис"]);
});

test("ДЗ группе по номерам: сначала задачи, которые никто не решил; решённые всеми не берём", async () => {
  const a = await makeUser({ teacherId: "u_1" });
  const b = await makeUser({ teacherId: "u_1" });
  const all = await db.execute(sql`select id from problems where skill_id is not null and ege_task_number = 1 order by id`);
  const ids = (all.rows as { id: string }[]).map((r) => r.id);
  assert.ok(ids.length >= 4, "в банке нужны задачи №1");
  const [both, onlyA] = ids;
  await attempt(a.id, both, true, new Date());
  await attempt(b.id, both, true, new Date());
  await attempt(a.id, onlyA, true, new Date());
  const picked = await pickByNumbers([a.id, b.id], [1], ids.length);
  assert.ok(!picked.includes(both), "решённая всеми не попадает");
  assert.ok(picked.includes(onlyA), "решённая одним — попадает");
  assert.equal(picked[picked.length - 1], onlyA, "решённая кем-то — в конце");
  // Для одного ученика — как раньше: решённые им не берём.
  assert.ok(!(await pickByNumbers(a.id, [1], ids.length)).includes(onlyA));
});

test("Telegram: одно сообщение на групповое занятие, «Были все» отмечает всех", async () => {
  const t = await makeUser({ role: "TEACHER", telegramChatId: "777" } as never);
  const a = await makeUser({ teacherId: t.id, name: "Анна Ли" });
  const b = await makeUser({ teacherId: t.id, name: "Борис Ким" });
  const groupId = `grp2_${t.id}`;
  await db.insert(schema.studentGroups).values({ id: groupId, teacherId: t.id, name: "11Б" });
  // 13:00 МСК — вне «тихих часов»; занятие закончилось час назад.
  const now = new Date("2026-10-05T10:00:00Z");
  const startsAt = new Date(now.getTime() - 2 * 3600 * 1000);
  const gl = `gl_${t.id}`;
  await db.insert(schema.scheduledLessons).values(
    [a, b].map((s, i) => ({ id: `sl_${t.id}_${i}`, teacherId: t.id, studentId: s.id, startsAt, durationMin: 60, groupId, groupLessonId: gl }))
  );

  const sent: { url: string; body: any }[] = [];
  const realFetch = globalThis.fetch;
  process.env.TELEGRAM_BOT_TOKEN = "123:test";
  globalThis.fetch = (async (url: string, init: any) => {
    sent.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
  }) as typeof fetch;
  try {
    await sendLessonStatusPrompts(now);
    const msgs = sent.filter((s) => s.body.chat_id === "777" && s.url.endsWith("/sendMessage"));
    assert.equal(msgs.length, 1, "одно сообщение на группу");
    assert.match(msgs[0].body.text, /11Б/);
    assert.match(msgs[0].body.text, /Анна, Борис/);
    assert.equal(msgs[0].body.reply_markup.inline_keyboard[0][0].callback_data, `lg:d:${gl}`);

    await handleCallbackQuery({ id: "cq", data: `lg:d:${gl}`, message: { chat: { id: 777 }, message_id: 1 } });
    const st = await db.select({ s: schema.scheduledLessons.status }).from(schema.scheduledLessons).where(eq(schema.scheduledLessons.groupLessonId, gl));
    assert.deepEqual(st.map((r) => r.s), ["done", "done"]);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.TELEGRAM_BOT_TOKEN;
  }
});
