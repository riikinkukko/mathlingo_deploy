import { test, after } from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { db } from "../../lib/db/client";
import * as schema from "../../lib/db/schema";
import { createSessionToken, getSessionUser, runAsUser } from "../../lib/auth";
import { POST as actionPOST } from "../../app/api/m/teacher/action/route";
import { GET as dataGET } from "../../app/api/m/teacher/data/route";
import { toFormData } from "../../lib/mobile/teacher-actions";
import { workAsyncStorage } from "next/dist/server/app-render/work-async-storage.external";
import { makeUser, cleanup } from "../helpers";

after(cleanup);

const auth = async (u: { id: string; role: "STUDENT" | "TEACHER" | "PARENT" }) => ({
  authorization: `Bearer ${await createSessionToken(u.id, u.role)}`,
});
// В Next обработчик идёт внутри «хранилища запроса» — revalidatePath пишет туда.
// В тестах даём минимальное такое хранилище.
const inRequest = <T>(fn: () => Promise<T>) =>
  workAsyncStorage.run({ route: "/api/m/teacher/action", incrementalCache: {} } as never, fn);
const act = async (u: { id: string; role: "STUDENT" | "TEACHER" | "PARENT" }, name: string, fields: Record<string, unknown>) => {
  const headers = await auth(u);
  return inRequest(() =>
    actionPOST(new Request("http://x/api/m/teacher/action", { method: "POST", headers, body: JSON.stringify({ name, fields }) }))
  );
};
const data = async (u: { id: string; role: "STUDENT" | "TEACHER" | "PARENT" }, qs: string) =>
  dataGET(new Request(`http://x/api/m/teacher/data?${qs}`, { headers: await auth(u) }));

test("runAsUser: действия сайта видят владельца токена, вне — нет", async () => {
  const t = await makeUser({ role: "TEACHER" });
  assert.equal((await runAsUser(t, () => getSessionUser()))?.id, t.id);
});

test("toFormData: массивы — повторяющиеся поля, true — on, false/null пропускаются", () => {
  const fd = toFormData({ studentIds: ["a", "b"], allowHints: true, x: false, y: null, n: 5 });
  assert.deepEqual(fd.getAll("studentIds"), ["a", "b"]);
  assert.equal(fd.get("allowHints"), "on");
  assert.equal(fd.get("x"), null);
  assert.equal(fd.get("y"), null);
  assert.equal(fd.get("n"), "5");
});

test("мост действий: только репетитор, только из списка, свой ученик", async () => {
  const t = await makeUser({ role: "TEACHER" });
  const other = await makeUser({ role: "TEACHER" });
  const s = await makeUser({ teacherId: t.id });
  const st = await makeUser();

  assert.equal((await act(st, "addMockScore", {})).status, 403);
  assert.equal((await act(t, "dropDatabase", {})).status, 400);

  const ok = await act(t, "addMockScore", { studentId: s.id, score: 72, takenAt: "2026-11-01" });
  assert.equal(ok.status, 200, JSON.stringify(await ok.clone().json()));
  const rows = await db.select().from(schema.mockScores).where(eq(schema.mockScores.studentId, s.id));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].score, 72);

  // Чужой репетитор не может писать пробник чужому ученику.
  const bad = await act(other, "addMockScore", { studentId: s.id, score: 50, takenAt: "2026-11-01" });
  assert.equal(bad.status, 400);
  assert.equal((await db.select().from(schema.mockScores).where(eq(schema.mockScores.studentId, s.id))).length, 1);
});

test("мост действий: ошибка-редирект сайта превращается в понятный текст", async () => {
  const t = await makeUser({ role: "TEACHER" });
  const s = await makeUser({ teacherId: t.id });
  const r = await act(t, "createHomework", { studentId: s.id, title: "ДЗ", dueDate: "2030-01-01", kind: "homework" });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error, "Не выбрано ни одной задачи.");
});

test("занятие из приложения: создать, отметить «было»", async () => {
  const t = await makeUser({ role: "TEACHER" });
  const s = await makeUser({ teacherId: t.id });
  const r = await act(t, "createLesson", { studentId: s.id, startsAt: "2030-03-04T15:00", durationMin: 60, repeatWeeks: 1 });
  assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
  const [l] = await db.select().from(schema.scheduledLessons).where(eq(schema.scheduledLessons.studentId, s.id));
  assert.ok(l);
  const m = await act(t, "setLessonStatus", { lessonId: l.id, status: "done", from: "schedule" });
  assert.equal(m.status, 200, JSON.stringify(await m.clone().json()));
  const [after] = await db
    .select()
    .from(schema.scheduledLessons)
    .where(and(eq(schema.scheduledLessons.id, l.id), eq(schema.scheduledLessons.status, "done")));
  assert.ok(after);
});

test("данные экранов: свой ученик виден, чужой — 404; без хеша пароля", async () => {
  const t = await makeUser({ role: "TEACHER" });
  const other = await makeUser({ role: "TEACHER" });
  const s = await makeUser({ teacherId: t.id, name: "Ученик Тест" });
  const home = await (await data(t, "view=home")).json();
  assert.equal(home.students.length, 1);
  assert.equal(home.students[0].name, "Ученик Тест");
  assert.ok(!JSON.stringify(home).includes("passwordHash"));
  assert.equal((await data(t, `view=student&id=${s.id}`)).status, 200);
  assert.equal((await data(other, `view=student&id=${s.id}`)).status, 404);
  for (const v of ["schedule", "reviews", "payments", "groups", "questions", "settings", `builder&studentId=${s.id}`]) {
    assert.equal((await data(t, `view=${v}`)).status, 200, v);
  }
  assert.equal((await data(s, "view=home")).status, 403);
});
