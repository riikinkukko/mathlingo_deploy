import assert from "node:assert/strict";
import { spawn } from "node:child_process";
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
const server = createServer(async (request, response) => {
  calls.push(request.url);
  await delay(100);
  response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({
    ok: true, result: request.url.endsWith("/getUpdates") ? [] : true,
  }));
});
server.listen(0, "127.0.0.1");
await once(server, "listening");

const worker = spawn(process.execPath, ["--import", "tsx", "scripts/telegram-poller.ts"], {
  env: {
    ...process.env,
    DATABASE_URL: database.href,
    SMTP_HOST: "",
    PUSH_DISABLED: "1",
    TELEGRAM_BOT_TOKEN: "fixture",
    TELEGRAM_API_BASE: `http://127.0.0.1:${server.address().port}`,
    TELEGRAM_READY_FILE: marker,
    TELEGRAM_READY_LAUNCH: "fixture-launch",
  },
  stdio: "inherit",
});
const exited = once(worker, "exit");
try {
  let ready;
  for (let attempt = 0; attempt < 100 && !ready; attempt++) {
    ready = await readFile(marker, "utf8").catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
    if (!ready) await delay(100);
  }
  const { readyAt, ...identity } = JSON.parse(ready);
  assert.ok(Number.isFinite(readyAt));
  assert.deepEqual(identity, { pid: worker.pid, release: process.cwd(), launch: "fixture-launch" });
  assert.ok(calls.includes("/botfixture/deleteWebhook"));
  assert.ok(calls.includes("/botfixture/getUpdates"));
  console.log("Telegram worker completed a poll and verified PostgreSQL before publishing readiness.");
} finally {
  worker.kill();
  await exited;
  server.closeAllConnections();
  server.close();
  await rm(dir, { recursive: true, force: true });
}
