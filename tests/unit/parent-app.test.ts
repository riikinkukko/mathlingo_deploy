import { test, after } from "node:test";
import assert from "node:assert/strict";

import { db } from "../../lib/db/client";
import * as schema from "../../lib/db/schema";
import { createSessionToken } from "../../lib/auth";
import { getUserById } from "../../lib/queries";
import { GET, POST } from "../../app/api/m/parent/route";
import { makeUser, cleanup } from "../helpers";

after(cleanup);

type U = { id: string; role: "STUDENT" | "TEACHER" | "PARENT" };
const h = async (u: U) => ({ authorization: `Bearer ${await createSessionToken(u.id, u.role)}` });

test("родитель в приложении: свои дети видны, чужие — нет; комментарий к пробнику скрыт", async () => {
  const t = await makeUser({ role: "TEACHER" });
  const kid = await makeUser({ teacherId: t.id, name: "Ребёнок" });
  const other = await makeUser({ teacherId: t.id });
  const p = await makeUser({ role: "PARENT" });
  await db.insert(schema.parentLinks).values({ parentId: p.id, studentId: kid.id });
  await db.insert(schema.mockScores).values({ id: `m_${kid.id}`, studentId: kid.id, teacherId: t.id, score: 70, takenAt: "2026-11-01", note: "секрет репетитора" } as never);

  const home = await (await GET(new Request("http://x/api/m/parent", { headers: await h(p) }))).json();
  assert.deepEqual(home.children.map((c: { name: string }) => c.name), ["Ребёнок"]);

  const r = await GET(new Request(`http://x/api/m/parent?view=child&id=${kid.id}`, { headers: await h(p) }));
  assert.equal(r.status, 200);
  const body = await r.text();
  assert.ok(body.includes('"score":70'));
  assert.ok(!body.includes("секрет репетитора"));
  assert.equal((await GET(new Request(`http://x/api/m/parent?view=child&id=${other.id}`, { headers: await h(p) }))).status, 404);
  assert.equal((await GET(new Request("http://x/api/m/parent", { headers: await h(t) }))).status, 403);
});

test("родитель в приложении: недельный отчёт включается и выключается", async () => {
  const p = await makeUser({ role: "PARENT" });
  const post = async (v: boolean) =>
    POST(new Request("http://x/api/m/parent", { method: "POST", headers: await h(p), body: JSON.stringify({ weeklyReport: v }) }));
  assert.equal((await post(false)).status, 200);
  assert.equal((await getUserById(p.id))?.tgWeeklyReport, false);
  assert.equal((await post(true)).status, 200);
  assert.equal((await getUserById(p.id))?.tgWeeklyReport, true);
});
