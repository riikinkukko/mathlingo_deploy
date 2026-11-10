import { test, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db } from "../../lib/db/client";
import * as schema from "../../lib/db/schema";
import { generateTelegramLinkCode, isTelegramCodeFresh, linkTelegramAccountByCode, TELEGRAM_CODE_TTL_MS } from "../../lib/queries";
import { consumeWebLink, createWebLink } from "../../lib/mobile/web-link";
import { makeUser, cleanup } from "../helpers";

after(cleanup);

test("код привязки Telegram: живёт сутки, старый формат не принимается", async () => {
  const now = Date.now();
  assert.equal(isTelegramCodeFresh(`abc_${now.toString(36)}`, now), true);
  assert.equal(isTelegramCodeFresh(`abc_${(now - TELEGRAM_CODE_TTL_MS - 1000).toString(36)}`, now), false);
  assert.equal(isTelegramCodeFresh("abcdefghijkmnpqr", now), false, "код без времени выдачи");

  const u = await makeUser();
  const code = await generateTelegramLinkCode(u.id);
  assert.match(code, /^[A-Za-z0-9_-]{1,64}$/, "Telegram принимает только такие символы");
  assert.equal(await linkTelegramAccountByCode(code, "chat_1"), true);
  assert.equal(await linkTelegramAccountByCode(code, "chat_2"), false, "одноразовый");

  // Просроченный код из базы не привязывает.
  const old = `zzzzzzzzzzzzzzzz_${(Date.now() - TELEGRAM_CODE_TTL_MS - 60_000).toString(36)}`;
  await db.update(schema.users).set({ telegramLinkCode: old }).where(eq(schema.users.id, u.id));
  assert.equal(await linkTelegramAccountByCode(old, "chat_3"), false);
});

test("вход на сайт из приложения: длинный случайный одноразовый токен", async () => {
  const u = await makeUser();
  const t = await createWebLink(u.id, "/student/profile");
  assert.ok(t.length >= 30, "не короткий id, а криптостойкий токен");
  assert.deepEqual(await consumeWebLink(t), { userId: u.id, next: "/student/profile" });
  assert.equal(await consumeWebLink(t), null);
});
