import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createElement as h, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { eq } from "drizzle-orm";
import { db } from "../../lib/db/client";
import * as schema from "../../lib/db/schema";
import { createSessionToken } from "../../lib/auth";
import { renderSvgToString } from "../../lib/mobile/svg-serialize";
import { consumeWebLink, createWebLink, safeNext } from "../../lib/mobile/web-link";
import { isExpoPushToken, savePushToken, deletePushToken } from "../../lib/push";
import { mobileProblem } from "../../lib/mobile/api";
import { answerFingerprint } from "../../lib/answer-key";
import { GET as meGET } from "../../app/api/m/me/route";
import { GET as homeGET } from "../../app/api/m/home/route";
import { POST as loginPOST } from "../../app/api/m/auth/login/route";
import { POST as attemptsPOST } from "../../app/api/m/attempts/route";
import { makeUser, problems, cleanup } from "../helpers";

after(cleanup);

const bearer = async (u: { id: string; role: "STUDENT" | "TEACHER" | "PARENT" }) => ({
  authorization: `Bearer ${await createSessionToken(u.id, u.role)}`,
});

test("SVG-сериализатор даёт ту же разметку, что react-dom", () => {
  const node = h(
    "svg",
    { viewBox: "0 0 10 10", strokeWidth: 2, style: { fontSize: 12, opacity: 0.5 } },
    h(Fragment, null, h("path", { d: "M0 0L10 10", strokeDasharray: "2 2" }), h("text", { x: 1, textAnchor: "middle" }, "A & B's <x>")),
    [h("circle", { key: "c", cx: 5, cy: 5, r: 2, fillOpacity: 0.3 })]
  );
  // пустые элементы сериализатор закрывает сам: <path/> вместо <path></path>
  const expected = renderToStaticMarkup(node).replace(/<(\w+)([^<>]*)><\/\1>/g, "<$1$2/>");
  assert.equal(renderSvgToString(node), expected);
});

test("ссылка входа на сайт: только относительный путь, одноразовая", async () => {
  assert.equal(safeNext("/teacher"), "/teacher");
  assert.equal(safeNext("//evil.com"), "/");
  assert.equal(safeNext("https://evil.com"), "/");
  assert.equal(safeNext("/\\evil.com"), "/");
  const u = await makeUser();
  const id = await createWebLink(u.id, "/student/profile");
  assert.deepEqual(await consumeWebLink(id), { userId: u.id, next: "/student/profile" });
  assert.equal(await consumeWebLink(id), null);
  const old = await createWebLink(u.id, "/");
  await db.update(schema.appLoginTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.appLoginTokens.id, old));
  assert.equal(await consumeWebLink(old), null);
});

test("push-токены: принимаются только токены Expo, один токен — одно устройство", async () => {
  assert.ok(isExpoPushToken("ExponentPushToken[abc123]"));
  assert.ok(!isExpoPushToken("https://evil"));
  const a = await makeUser();
  const b = await makeUser();
  const token = `ExponentPushToken[t${Date.now()}]`;
  await savePushToken(a.id, token, "android");
  await savePushToken(b.id, token, "android");
  const rows = await db.select().from(schema.pushTokens).where(eq(schema.pushTokens.token, token));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].userId, b.id);
  await deletePushToken(b.id, token);
});

test("задача для приложения: ответа в выдаче нет, только отпечаток", async () => {
  const [p] = (await problems(20)).filter((x) => !x.diagram);
  const m = mobileProblem(p as never);
  const s = JSON.stringify(m);
  assert.ok(!("correctAnswer" in m) && !s.includes('"explanation"'));
  assert.equal(m.check, answerFingerprint(p.id, p.correctAnswer));
  assert.equal(mobileProblem(p as never, { offline: false }).check, null);
});

test("API: без токена 401, с токеном — профиль и главная", async () => {
  const anon = await meGET(new Request("http://x/api/m/me"));
  assert.equal(anon.status, 401);
  const u = await makeUser();
  const me = await meGET(new Request("http://x/api/m/me", { headers: await bearer(u) }));
  assert.equal(me.status, 200);
  const body = await me.json();
  assert.equal(body.user.id, u.id);
  assert.ok(body.token);
  const home = await homeGET(new Request("http://x/api/m/home", { headers: await bearer(u) }));
  assert.equal(home.status, 200);
  const hb = await home.json();
  assert.ok(Array.isArray(hb.topics) && hb.topics.length > 0);
});

test("API: вход с неверным паролем отклоняется", async () => {
  const r = await loginPOST(
    new Request("http://x/api/m/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "10.9.8.7" },
      body: JSON.stringify({ email: "student@demo.ru", password: "wrong-password" }),
    })
  );
  assert.equal(r.status, 401);
});

test("API: ответ на задачу проверяется сервером", async () => {
  const u = await makeUser();
  const [p] = await problems(1);
  const send = async (answer: string) =>
    (
      await attemptsPOST(
        new Request("http://x/api/m/attempts", {
          method: "POST",
          headers: { ...(await bearer(u)), "content-type": "application/json" },
          body: JSON.stringify({ problemId: p.id, answer, source: "lesson" }),
        })
      )
    ).json();
  assert.equal((await send("987654321")).kind, "wrong");
  assert.equal((await send(p.correctAnswer)).kind, "correct");
});
