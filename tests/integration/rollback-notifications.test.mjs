import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const dbUrl = new URL(process.env.DATABASE_URL ?? "");
assert.ok(["127.0.0.1", "localhost"].includes(dbUrl.hostname) && dbUrl.pathname === "/unlink_upgrade_test");
const load = async (path) => {
  const module = await import(pathToFileURL(resolve(path)).href);
  return module.default ?? module;
};
const { SignJWT } = await import("jose");
const { getSessionSecret } = await load("lib/session-secret.ts");
const { GET } = await load("app/api/m/notifications/route.ts");
const { db } = await load("lib/db/client.ts");
try {
  const token = await new SignJWT({ userId: "fixture_parent", role: "PARENT" })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt(1700000000).setExpirationTime(2100000000)
    .sign(getSessionSecret());
  const response = await GET(new Request("http://localhost/api/m/notifications", {
    headers: { authorization: `Bearer ${token}` },
  }));
  assert.equal(response.status, 200);
  const { notifications, unread } = await response.json();
  const expected = Number(process.argv[2]);
  assert.equal(notifications.length, expected);
  assert.equal(unread, expected);
  if (expected) assert.equal(notifications[0].id, "legacy_notice");
  console.log(`Parent notification API returned ${expected} rows for the historical token.`);
} finally {
  await (globalThis.__pgPool ?? db.$client).end();
}
