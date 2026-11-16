import { test, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../lib/db/client";
import * as schema from "../../lib/db/schema";
import { ownTaskPhotoIds, readTaskPhoto, saveTaskPhoto } from "../../lib/task-photos";
import { parseNumbers } from "../../app/teacher/homework/new/BookTasksBuilder";
import { makeUser, cleanup } from "../helpers";

after(cleanup);

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

test("номера из сборника: номер и ответ в разных записях, без ответа — развёрнутое", () => {
  assert.deepEqual(parseNumbers("5 12\n№9: 0,25\n12 — -3\n14\n\n"), [
    { n: "5", answer: "12" },
    { n: "9", answer: "0,25" },
    { n: "12", answer: "-3" },
    { n: "14", answer: "" },
  ]);
});

test("фото страницы сборника: видят репетитор, его ученик и родитель ученика; чужие — нет", async () => {
  const t = await makeUser({ role: "TEACHER" });
  const other = await makeUser({ role: "TEACHER" });
  const st = await makeUser({ teacherId: t.id });
  const stranger = await makeUser();
  const parent = await makeUser({ role: "PARENT" });
  await db.insert(schema.parentLinks).values({ parentId: parent.id, studentId: st.id });

  assert.ok("error" in (await saveTaskPhoto(st, PNG)), "ученик загружать не может");
  assert.ok("error" in (await saveTaskPhoto(t, "data:text/html;base64,PHA+")), "только картинки");
  const r = await saveTaskPhoto(t, PNG);
  assert.ok("id" in r);
  if (!("id" in r)) return;

  for (const u of [t, st, parent]) assert.ok(await readTaskPhoto(u, r.id), `видит ${u.role}`);
  for (const u of [other, stranger]) assert.equal(await readTaskPhoto(u, r.id), null);

  // В задание можно вложить только свои снимки.
  assert.deepEqual([...(await ownTaskPhotoIds(t.id, [r.id, "tp_чужой"]))], [r.id]);
  assert.equal((await ownTaskPhotoIds(other.id, [r.id])).size, 0);
});
