import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const database = new URL(process.env.TEST_DATABASE_URL ?? "");
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname) && database.pathname === "/mathapp_test");
const dir = await mkdtemp(join(tmpdir(), "telegram-ready-"));
const marker = join(dir, "ready");
const calls = [];
let rejectPolls = false;
const server = createServer(async (request, response) => {
  calls.push(request.url);
  await delay(100);
  response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({
    ok: !rejectPolls, result: request.url.endsWith("/getUpdates") ? [] : true,
  }));
});
server.listen(0, "127.0.0.1");
await once(server, "listening");

const env = {
  ...process.env,
  PM2_HOME: join(dir, "pm2"),
  DATABASE_URL: database.href,
  SMTP_HOST: "",
  PUSH_DISABLED: "1",
  TELEGRAM_BOT_TOKEN: "fixture",
  TELEGRAM_API_BASE: `http://127.0.0.1:${server.address().port}`,
  TELEGRAM_READY_FILE: marker,
  TELEGRAM_READY_LAUNCH: "fixture-launch",
};
const run = promisify(execFile);
const pm2 = async (...args) => (await run("pm2", args, { env, timeout: 20_000 })).stdout;
const info = async () => JSON.parse(await pm2("jlist")).find((entry) => entry.name === "fixture-worker");
const getMarker = async () => {
  try {
    return JSON.parse(await readFile(marker, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return null;
  }
};
const matches = (record, worker) => !!record && worker?.pm2_env.status === "online" &&
  record.pid === worker.pid && record.release === worker.pm2_env.pm_cwd &&
  record.launch === env.TELEGRAM_READY_LAUNCH && record.readyAt >= worker.pm2_env.pm_uptime;
async function waitForReady() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const record = await getMarker();
    if (matches(record, await info())) return record;
    await delay(150);
  }
  assert.fail("PM2 worker did not publish matching readiness");
}
try {
  await pm2("start", join(process.cwd(), "scripts", "telegram-poller.ts"), "--interpreter", "node",
    "--node-args=--import tsx", "--name", "fixture-worker", "--cwd", process.cwd());
  const first = await waitForReady();
  assert.ok(calls.includes("/botfixture/deleteWebhook"));
  assert.ok(calls.includes("/botfixture/getUpdates"));
  await pm2("save", "--force");
  await pm2("delete", "fixture-worker");
  assert.equal(await info(), undefined);
  rejectPolls = true;
  await pm2("resurrect");
  assert.equal(matches(await getMarker(), await info()), false);
  rejectPolls = false;
  const restored = await waitForReady();
  assert.notEqual(restored.pid, first.pid);
  console.log("PM2 worker completed polling, rejected stale readiness and restored the saved launch.");
} finally {
  await pm2("kill").catch(() => {});
  server.closeAllConnections();
  server.close();
  await rm(dir, { recursive: true, force: true });
}
