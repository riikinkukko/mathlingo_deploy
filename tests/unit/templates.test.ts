import { test, after } from "node:test";
import assert from "node:assert/strict";
import { deleteTemplate, getTemplate, listTemplates, saveTemplate, saveTemplateFromHomework } from "../../lib/templates";
import { makeUser, makeHomework, problems, cleanup } from "../helpers";

after(cleanup);

test("шаблоны: сохранить, выдать можно только своему репетитору, удалить", async () => {
  const a = await makeUser({ role: "TEACHER" });
  const b = await makeUser({ role: "TEACHER" });
  const ps = (await problems(3)).map((p) => p.id);
  const id = await saveTemplate(a.id, { title: "Пифагор", kind: "homework", allowHints: true, timeLimitMinutes: null, problemIds: ps });
  assert.ok(id);
  assert.equal((await listTemplates(a.id)).length, 1);
  assert.deepEqual((await getTemplate(id!, a.id))?.problemIds, ps);
  assert.equal(await getTemplate(id!, b.id), null, "чужой шаблон не виден");
  assert.equal(await deleteTemplate(id!, b.id), false, "чужой шаблон не удалить");
  assert.equal(await deleteTemplate(id!, a.id), true);
  assert.equal((await listTemplates(a.id)).length, 0);
  assert.equal(await saveTemplate(a.id, { title: "x", kind: "test", allowHints: false, timeLimitMinutes: 45, problemIds: [] }), null);
});

test("шаблон из задания: только из своего задания, настройки сохраняются", async () => {
  const a = await makeUser({ role: "TEACHER" });
  const b = await makeUser({ role: "TEACHER" });
  const s = await makeUser({ teacherId: a.id });
  const ps = (await problems(2)).map((p) => p.id);
  const hw = await makeHomework({ studentId: s.id, teacherId: a.id, problemIds: ps, kind: "test", allowHints: false, timeLimitMinutes: 40 });
  assert.equal(await saveTemplateFromHomework(hw, b.id), null);
  const id = await saveTemplateFromHomework(hw, a.id);
  const t = await getTemplate(id!, a.id);
  assert.equal(t?.kind, "test");
  assert.equal(t?.allowHints, false);
  assert.equal(t?.timeLimitMinutes, 40);
  assert.deepEqual(t?.problemIds, ps);
});
