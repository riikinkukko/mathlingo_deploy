import { test, after } from "node:test";
import assert from "node:assert/strict";
import { getCurriculum } from "../../lib/queries";
import { getLessonData } from "../../lib/lesson-data";
import { makeUser, cleanup } from "../helpers";

after(cleanup);

test("урок заранее для работы без сети: следующий за текущим — да, через один — нет", async () => {
  const u = await makeUser({ plan: "pro" });
  const topic = (await getCurriculum())[0];
  const skills = topic.chapters.flatMap((c) => c.skills);
  assert.ok(skills.length >= 3);
  // У нового ученика первый урок — текущий, остальные закрыты.
  assert.equal((await getLessonData(u, skills[1].id)).status, "locked");
  assert.equal((await getLessonData(u, skills[1].id, { ahead: true })).status, "ok");
  assert.equal((await getLessonData(u, skills[2].id, { ahead: true })).status, "locked");
});

test("заранее не обходит ограничения Free", async () => {
  const u = await makeUser({ plan: "free" });
  const topic = (await getCurriculum())[0];
  const ch2 = topic.chapters[1];
  assert.ok(ch2 && ch2.skills.length >= 2);
  assert.equal((await getLessonData(u, ch2.skills[1].id, { ahead: true })).status, "upgrade");
});
