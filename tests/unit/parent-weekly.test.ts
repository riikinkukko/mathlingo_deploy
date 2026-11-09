import { test, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db } from "../../lib/db/client";
import * as schema from "../../lib/db/schema";
import { buildChildWeekReport, reportWeekFor, sendParentWeeklyReports, weeklyEmailHtml } from "../../lib/parent-weekly";
import { runJobs } from "../../lib/scheduler";
import { makeUser, cleanup } from "../helpers";

after(cleanup);

// 2026-11-15 — воскресенье, 2026-11-16 — понедельник (МСК = UTC+3).
const at = (iso: string) => new Date(iso);

test("недельный отчёт: окно — воскресенье с 19:00 и догонка до полудня понедельника", () => {
  assert.equal(reportWeekFor(at("2026-11-15T18:30:00+03:00")), null);
  const sun = reportWeekFor(at("2026-11-15T19:05:00+03:00"));
  const mon = reportWeekFor(at("2026-11-16T09:00:00+03:00"));
  assert.ok(sun && mon);
  assert.equal(sun!.key, "2026-11-09");
  assert.equal(mon!.key, "2026-11-09", "в понедельник догоняем ПРОШЛУЮ неделю");
  assert.equal(reportWeekFor(at("2026-11-16T12:30:00+03:00")), null);
  assert.equal(reportWeekFor(at("2026-11-18T20:00:00+03:00")), null);
});

test("недельный отчёт: темы занятий за неделю попадают в текст; уходит один раз", async () => {
  const teacher = await makeUser({ role: "TEACHER" });
  const child = await makeUser({ teacherId: teacher.id, name: "Маша Иванова" });
  const parent = await makeUser({ role: "PARENT", tgWeeklyReport: true });
  await db.insert(schema.parentLinks).values({ parentId: parent.id, studentId: child.id });
  await db.insert(schema.lessonLogs).values({
    id: `tl_${parent.id}`,
    teacherId: teacher.id,
    studentId: child.id,
    date: "2026-11-12",
    topic: "Метод интервалов",
    report: "Разобрали",
  });
  const now = at("2026-11-15T20:00:00+03:00");
  const r = await buildChildWeekReport(child, now);
  assert.match(r.title, /Маша/);
  assert.match(r.body, /Метод интервалов/);

  const n1 = await sendParentWeeklyReports(now);
  assert.ok(n1 >= 1);
  const mine = () => db.select().from(schema.notifications).where(eq(schema.notifications.userId, parent.id));
  const count = (await mine()).length;
  await sendParentWeeklyReports(at("2026-11-16T09:00:00+03:00")); // догонка не дублирует
  assert.equal((await mine()).length, count);
});

test("письмо отчёта экранирует текст", () => {
  const html = weeklyEmailHtml([{ child: { id: "u1" } as never, title: "Неделя <b>", body: "строка 1\nстрока <2>" }]);
  assert.ok(html.includes("Неделя &lt;b&gt;"));
  assert.ok(html.includes("строка &lt;2&gt;"));
  assert.ok(!html.includes("<b>"));
});

test("фоновые задачи: ошибка одной не мешает остальным", async () => {
  const errors: string[] = [];
  const res = await runJobs(
    [
      { name: "a", run: async () => 1 },
      { name: "b", run: async () => { throw new Error("boom"); } },
      { name: "c", run: async () => 2 },
    ],
    (name) => errors.push(name),
    () => {}
  );
  assert.deepEqual(errors, ["b"]);
  assert.deepEqual(res.map((r) => r.sent), [1, 0, 2]);
});
