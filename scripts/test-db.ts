/**
 * Готовит ОТДЕЛЬНУЮ тестовую базу: стирает её, накатывает все миграции и
 * заливает демо-данные (seed). Запуск: `npm run test:db`.
 *
 * Защита от стирания рабочей базы:
 *  • адрес берётся только из TEST_DATABASE_URL (не из DATABASE_URL);
 *  • имя базы обязано содержать «test»;
 *  • адрес не может совпадать с DATABASE_URL из .env.local.
 */
import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { config, parse } from "dotenv";
import { Client } from "pg";

config({ path: ".env.local" });
// Рабочий адрес — именно из файла .env.local (в CI файла нет, а DATABASE_URL
// там нарочно указывает на тестовую базу).
const fileEnv = existsSync(".env.local") ? parse(readFileSync(".env.local")) : {};

async function main() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    console.error("Задайте TEST_DATABASE_URL — адрес отдельной тестовой базы (имя должно содержать «test»).");
    process.exit(1);
  }
  const dbName = new URL(url).pathname.replace(/^\//, "");
  if (!/test/i.test(dbName)) {
    console.error(`Отказ: имя базы «${dbName}» не содержит «test». Это защита от стирания рабочей базы.`);
    process.exit(1);
  }
  if (fileEnv.DATABASE_URL && fileEnv.DATABASE_URL === url) {
    console.error("Отказ: TEST_DATABASE_URL совпадает с DATABASE_URL из .env.local.");
    process.exit(1);
  }

  const c = new Client({ connectionString: url });
  await c.connect();
  await c.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await c.end();

  const env = { ...process.env, DATABASE_URL: url };
  execSync("npx drizzle-kit migrate", { stdio: "inherit", env });
  execSync("npx tsx scripts/seed.ts", { stdio: "inherit", env });
  console.log(`✓ Тестовая база «${dbName}» готова`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
