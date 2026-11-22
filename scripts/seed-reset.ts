import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client, type ClientConfig } from "pg";
import * as schema from "../lib/db/schema";

type TransactionArgs = Parameters<NodePgDatabase<typeof schema>["transaction"]>;
export type SeedTransaction = Parameters<TransactionArgs[0]>[0];

export class SeedResetRefusal extends Error {
  constructor(reason: "permission" | "configuration" | "target") {
    super({
      permission: "Сброс запрещён: укажите ALLOW_SEED_RESET=1.",
      configuration: "Сброс запрещён: задайте отдельный локальный SEED_RESET_DATABASE_URL и SEED_RESET_TOKEN.",
      target: "Сброс запрещён: одноразовая база не подтверждена.",
    }[reason]);
  }
}

function readResetTarget() {
  if (process.env.ALLOW_SEED_RESET !== "1") throw new SeedResetRefusal("permission");

  const token = process.env.SEED_RESET_TOKEN;
  const rawUrl = process.env.SEED_RESET_DATABASE_URL;
  if (!token || !/^[a-f0-9]{32}$/.test(token) || !rawUrl || /[?#\s]/.test(rawUrl)) {
    throw new SeedResetRefusal("configuration");
  }

  try {
    const url = new URL(rawUrl);
    const database = url.pathname.slice(1);
    const port = Number(url.port);
    const user = decodeURIComponent(url.username);
    const password = decodeURIComponent(url.password);
    if (
      !["postgresql:", "postgres:"].includes(url.protocol) ||
      url.hostname !== "127.0.0.1" ||
      !Number.isInteger(port) || port < 1 || port > 65535 ||
      !/^[a-z_][a-z0-9_]{0,62}$/.test(user) ||
      !password || password.includes("\0") ||
      !/^seed_reset_test_[a-f0-9]{32}$/.test(database)
    ) {
      throw new SeedResetRefusal("configuration");
    }

    return { token, database, user, password, port };
  } catch {
    throw new SeedResetRefusal("configuration");
  }
}

export async function withSeedTransaction<T>(
  config: ClientConfig,
  run: (tx: SeedTransaction) => Promise<T>,
  transactionConfig?: TransactionArgs[1],
): Promise<T> {
  const client = new Client(config);
  // A disconnected client rejects subsequent queries. Also absorb idle socket
  // errors so they cannot bypass the CLI's sanitized exception handler.
  client.on("error", () => {});
  try {
    await client.connect();
    return await drizzle(client, { schema }).transaction(async (tx) => {
      // Serialize seed writers before checking the permit or whether the database is empty.
      await tx.execute(sql`SELECT pg_catalog.pg_advisory_xact_lock(73810017, 1)`);
      return run(tx);
    }, transactionConfig);
  } finally {
    await client.end();
  }
}

export function withSeedReset<T>(run: (tx: SeedTransaction) => Promise<T>): Promise<T> {
  const { token, database, user, password, port } = readResetTarget();
  // Use explicit fields so URL parameters and ambient PG* settings cannot redirect reset.
  return withSeedTransaction({
    host: "127.0.0.1",
    port,
    user,
    password,
    database,
    ssl: false,
    application_name: "planimetrika-seed-reset",
    options: "-c search_path=public,pg_catalog",
    connectionTimeoutMillis: 5000,
  }, async (tx) => {
    // Compare the inherited comment against the live database and postmaster identity
    // after acquiring the seed lock. See scripts/seed-reset-permit.sql.
    const { rows: [identity] } = await tx.execute<{ permitted: boolean | null }>(sql`
      SELECT pg_catalog.shobj_description(d.oid, 'pg_database') =
             pg_catalog.concat('planimetrika:seed-reset:v2:', ${token}::text, ':',
               (pg_catalog.pg_control_system()).system_identifier, ':',
               EXTRACT(EPOCH FROM pg_catalog.pg_postmaster_start_time()), ':', d.oid) AS permitted
      FROM pg_catalog.pg_database AS d
      WHERE d.datname = pg_catalog.current_database() AND d.datname = ${database}
        AND current_user = ${user}
    `);
    if (identity?.permitted !== true) {
      throw new SeedResetRefusal("target");
    }
    return run(tx);
  }, { isolationLevel: "read committed" }); // Read the permit after any revocation committed while waiting.
}
