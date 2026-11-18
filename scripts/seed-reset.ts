import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client, type ClientConfig } from "pg";
import * as schema from "../lib/db/schema";

export type SeedTransaction = Parameters<Parameters<NodePgDatabase<typeof schema>["transaction"]>[0]>[0];

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

export async function withSeedTransaction<T>(config: ClientConfig, run: (tx: SeedTransaction) => Promise<T>): Promise<T> {
  const client = new Client(config);
  // A disconnected client rejects subsequent queries. Also absorb idle socket
  // errors so they cannot bypass the CLI's sanitized exception handler.
  client.on("error", () => {});
  try {
    await client.connect();
    return await drizzle(client, { schema }).transaction(run);
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
    options: "-c search_path=public,pg_catalog",
    connectionTimeoutMillis: 5000,
  }, async (tx) => {
    const { rows: [identity] } = await tx.execute<{ database: string; role: string; marker: string | null }>(sql`
      SELECT d.datname AS database, current_user AS role,
             pg_catalog.shobj_description(d.oid, 'pg_database') AS marker
      FROM pg_catalog.pg_database AS d
      WHERE d.datname = pg_catalog.current_database()
    `);
    if (identity?.database !== database || identity.role !== user || identity.marker !== `planimetrika:seed-reset:${token}`) {
      throw new SeedResetRefusal("target");
    }
    return run(tx);
  });
}
