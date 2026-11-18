import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { test } from "node:test";
import { Client } from "pg";

const token = process.env.SEED_RESET_TOKEN;
assert.match(token ?? "", /^[a-f0-9]{32}$/);

const allowUrl = process.env.SEED_RESET_DATABASE_URL;
const controlUrl = process.env.SEED_RESET_TEST_CONTROL_URL;

async function verifiedFixture(rawUrl: string | undefined, marker: string) {
  const url = new URL(rawUrl ?? "");
  assert.match(url.pathname, /^\/seed_reset_test_[a-f0-9]{32}$/);
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.search + url.hash, "");
  const client = new Client({ connectionString: url.href, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    const { rows: [target] } = await client.query<{ name: string; marker: string }>(`
      SELECT datname AS name, pg_catalog.shobj_description(oid, 'pg_database') AS marker
      FROM pg_catalog.pg_database WHERE datname = pg_catalog.current_database()
    `);
    assert.ok(target?.name === url.pathname.slice(1) && target.marker === marker, "Fixture identity was not established");
    return client;
  } catch {
    await client.end();
    throw new Error("Connect only to fixtures prepared by the isolated test procedure");
  }
}

async function seed(options: { reset: boolean; permission?: string; url?: string; marker?: string; databaseUrl?: string }) {
  const env = { ...process.env };
  delete env.ALLOW_SEED_RESET;
  delete env.SEED_RESET_DATABASE_URL;
  delete env.SEED_RESET_TOKEN;
  delete env.DATABASE_URL;
  if (options.permission !== undefined) env.ALLOW_SEED_RESET = options.permission;
  if (options.url !== undefined) env.SEED_RESET_DATABASE_URL = options.url;
  if (options.marker !== undefined) env.SEED_RESET_TOKEN = options.marker;
  if (options.databaseUrl !== undefined) env.DATABASE_URL = options.databaseUrl;

  const args = ["--import", "tsx", "scripts/seed.ts"];
  if (options.reset) args.push("--reset");
  const child = spawn(process.execPath, args, { env, stdio: ["ignore", "pipe", "pipe"], timeout: 90_000 });
  let output = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => { output += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => { output += chunk; });
  const [status, signal] = await once(child, "close");
  assert.equal(signal, null, "Seed process terminated unexpectedly");
  return { status, output };
}

function refused(result: Awaited<ReturnType<typeof seed>>, message: RegExp) {
  assert.equal(result.status, 1);
  assert.match(result.output, message);
  assert.doesNotMatch(result.output, /postgres(?:ql)?:\/\/|secret-password-marker|seed_sql_error_marker|✅/);
}

async function addFixture(client: Client) {
  await client.query(`
    INSERT INTO users (id, name, email, password_hash, role)
      VALUES ('issue1-user', 'Synthetic student', 'issue1@example.invalid', 'test-only', 'STUDENT');
    INSERT INTO problems (id, text, answer_type, correct_answer, hints, explanation, difficulty)
      VALUES ('issue1-problem', 'Synthetic problem', 'NUMBER', '42', '[]', 'Synthetic explanation', 1);
    INSERT INTO attempts (id, student_id, problem_id, answer, is_correct, source)
      VALUES ('issue1-attempt', 'issue1-user', 'issue1-problem', '42', true, 'lesson');
    INSERT INTO homeworks (id, student_id, title, kind, allow_hints, problem_ids, due_date)
      VALUES ('issue1-homework', 'issue1-user', 'Synthetic homework', 'homework', true, '["issue1-problem"]', '2026-01-01');
    INSERT INTO payments (id, user_id, yookassa_payment_id, amount_rub, status, period_days)
      VALUES ('issue1-payment', 'issue1-user', 'synthetic-payment-id', 1, 'pending', 30);
    INSERT INTO srs_states (student_id, problem_id, box)
      VALUES ('issue1-user', 'issue1-problem', 3);
  `);
}

const fixtureTables = ["users", "problems", "attempts", "homeworks", "payments", "srs_states"] as const;

async function fixtureSnapshot(client: Client, onlyFixture = false) {
  return Promise.all(fixtureTables.map(async (table) => {
    const key = table === "srs_states" ? "student_id" : "id";
    const filter = onlyFixture ? `WHERE ${key} LIKE 'issue1-%'` : "";
    const { rows: [row] } = await client.query<{ count: number; fingerprint: string }>(`
      SELECT count(*)::int AS count,
             md5(coalesce(string_agg(to_jsonb(t)::text, ',' ORDER BY to_jsonb(t)::text), '')) AS fingerprint
      FROM ${table} AS t ${filter}
    `);
    return row;
  }));
}

async function seedIdentities(client: Client) {
  const { rows } = await client.query<{ table_name: string; ids: string[] }>(`
    SELECT 'users' AS table_name, array_agg(id ORDER BY id) AS ids FROM users
    UNION ALL SELECT 'topics', array_agg(id ORDER BY id) FROM topics
    UNION ALL SELECT 'problems', array_agg(id ORDER BY id) FROM problems
    UNION ALL SELECT 'srs', array_agg(student_id || ':' || problem_id ORDER BY student_id, problem_id) FROM srs_states
    ORDER BY table_name
  `);
  return rows;
}

test("reset refuses missing, wrong, or malformed configuration before dialing", async () => {
  let connections = 0;
  const server = createServer((socket) => {
    connections++;
    socket.destroy();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const url = `postgresql://tester:secret-password-marker@127.0.0.1:${address.port}/seed_reset_test_${"1".repeat(32)}`;
    const valid = { reset: true, url, marker: token, databaseUrl: url };
    refused(await seed(valid), /ALLOW_SEED_RESET=1/);
    refused(await seed({ ...valid, permission: "true" }), /ALLOW_SEED_RESET=1/);
    refused(await seed({ ...valid, permission: "1", url: undefined }), /SEED_RESET_DATABASE_URL/);
    refused(await seed({ ...valid, permission: "1", marker: "bad" }), /SEED_RESET_TOKEN/);
    refused(await seed({ ...valid, permission: "1", url: url + "?host=127.0.0.2" }), /SEED_RESET_DATABASE_URL/);
    refused(await seed({ ...valid, permission: "1", url: "postgresql://secret-password-marker" }), /SEED_RESET_DATABASE_URL/);
    assert.equal(connections, 0);

    refused(await seed({ ...valid, permission: "1" }), /Не удалось завершить заполнение/);
    assert.equal(connections, 1, "Valid configuration must reach the connection error path");
  } finally {
    server.close();
  }
});

test("seed CLI preserves data on refusal and rolls back all reset writes", async (t) => {
  const allowed = await verifiedFixture(allowUrl, `planimetrika:seed-reset:${token}`);
  try {
    const control = await verifiedFixture(controlUrl, `planimetrika:seed-test-control:${token}`);
    try {
      const reset = { reset: true, permission: "1", url: allowUrl, marker: token };
      const ordinary = { reset: false, databaseUrl: controlUrl };

      assert.equal((await seed(ordinary)).status, 0);
      const { rows: [topic] } = await control.query<{ id: string; title: string }>("SELECT id, title FROM topics ORDER BY id LIMIT 1");
      assert.ok(topic);
      assert.equal((await control.query("SELECT 1 FROM users WHERE email = 'student@demo.ru'")).rowCount, 1);
      await addFixture(control);
      await addFixture(allowed);
      const controlBefore = await fixtureSnapshot(control);
      const allowedBefore = await fixtureSnapshot(allowed);
      const controlFixture = await fixtureSnapshot(control, true);
      assert.ok(controlFixture.every((entry) => entry.count === 1));

      await t.test("denials keep users, attempts, homework, payment, and SRS links", async () => {
        refused(await seed({ ...reset, permission: undefined }), /ALLOW_SEED_RESET=1/);
        refused(await seed({ ...reset, url: controlUrl }), /одноразовая база не подтверждена/);
        const otherToken = token === "0".repeat(32) ? "1".repeat(32) : "0".repeat(32);
        refused(await seed({ ...reset, marker: otherToken }), /одноразовая база не подтверждена/);
        assert.deepEqual(await fixtureSnapshot(control), controlBefore);
        assert.deepEqual(await fixtureSnapshot(allowed), allowedBefore);
      });

      await t.test("ordinary seed updates existing content and preserves linked user data", async () => {
        await control.query("UPDATE topics SET title = 'Changed in test' WHERE id = $1", [topic.id]);
        assert.equal((await seed(ordinary)).status, 0);
        assert.equal((await seed(ordinary)).status, 0);
        const { rows: [actual] } = await control.query("SELECT title FROM topics WHERE id = $1", [topic.id]);
        assert.equal(actual.title, topic.title);
        assert.deepEqual(await fixtureSnapshot(control, true), controlFixture);
        assert.deepEqual(await fixtureSnapshot(control), controlBefore);
      });

      await t.test("errors during content and late SRS inserts roll back everything", async () => {
        for (const [table, predicate] of [
          ["problems", "id = 'issue1-problem'"],
          ["srs_states", "student_id = 'issue1-user'"],
        ]) {
          await allowed.query(`ALTER TABLE ${table} ADD CONSTRAINT seed_sql_error_marker CHECK (${predicate})`);
          try {
            refused(await seed(reset), /Не удалось завершить заполнение/);
            assert.deepEqual(await fixtureSnapshot(allowed), allowedBefore);
            assert.equal((await allowed.query("SELECT 1 FROM topics LIMIT 1")).rowCount, 0);
            assert.equal((await allowed.query("SELECT 1 FROM skills LIMIT 1")).rowCount, 0);
          } finally {
            await allowed.query(`ALTER TABLE ${table} DROP CONSTRAINT seed_sql_error_marker`);
          }
        }
      });

      await t.test("successful reset includes SRS and can be repeated with stable identifiers", async () => {
        assert.equal((await seed(reset)).status, 0);
        assert.ok((await fixtureSnapshot(allowed, true)).every((entry) => entry.count === 0));
        const previous = await seedIdentities(allowed);
        assert.ok(previous.every((entry) => entry.ids?.length > 0));
        assert.equal((await seed(reset)).status, 0);
        assert.deepEqual(await seedIdentities(allowed), previous);
      });
    } finally {
      await control.end();
    }
  } finally {
    await allowed.end();
  }
});
