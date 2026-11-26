import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { db, getPool } from "../lib/db/client";

config({ path: ".env.local" });
config();

async function main() {
  try {
    const result = await db.execute<{ ready: boolean }>(sql`
      select exists (
        select 1 from pg_trigger
        where tgrelid = to_regclass('users')
          and tgname = 'require_student_account_deletion_authorization' and tgenabled in ('O', 'A')
      ) and exists (
        select 1 from pg_class where oid = to_regclass('parent_links') and relkind = 'v'
      ) as ready
    `);
    if (!result.rows[0]?.ready) throw new Error("Required deletion guard or verified-parent view is missing");
  } finally {
    await getPool().end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Release database verification failed");
  process.exitCode = 1;
});
