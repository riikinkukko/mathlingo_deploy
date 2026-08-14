import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

function getPool(): Pool {
  // Кэшируем пул через globalThis ВСЕГДА, не только в dev. Причина отличается
  // по окружению, но эффект нужен в обоих:
  // - dev: Next.js пересоздаёт модули при каждом hot-reload — без кэша плодились
  //   бы новые пулы на каждое сохранение файла.
  // - serverless (Vercel и подобные): один и тот же "тёплый" инстанс функции
  //   может обработать несколько запросов подряд — кэш даёт переиспользовать
  //   уже открытые соединения вместо новых на каждый вызов. Между РАЗНЫМИ
  //   инстансами кэш не помогает (это отдельные процессы) — именно поэтому
  //   для serverless важен pooler на стороне самой БД (Neon/Supabase дают
  //   "-pooler"-адрес для этого, см. README).
  if (!global.__pgPool) {
    global.__pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Небольшой max — при serverless одновременно может существовать много
      // отдельных инстансов функции, у каждого свой пул; большой max на пул
      // быстро исчерпал бы лимит соединений БД суммарно по всем инстансам.
      max: 5,
    });
  }
  return global.__pgPool;
}

let drizzleInstance: ReturnType<typeof drizzle<typeof schema>> | undefined;

function getDb() {
  if (!drizzleInstance) drizzleInstance = drizzle(getPool(), { schema });
  return drizzleInstance;
}

// db — Proxy, а не готовый объект: обращение к process.env.DATABASE_URL
// откладывается до ПЕРВОГО реального вызова (db.select(), db.transaction()
// и т.д.), а не происходит в момент импорта этого файла. В самом
// Next.js-приложении разницы не видно — .env.local подгружается ДО того, как
// вообще что-то импортируется. Но это критично для отдельных CLI-скриптов
// (scripts/seed.ts), запускаемых напрямую через tsx: там ES-импорты
// поднимаются наверх файла и выполняются РАНЬШЕ любого кода (включая вызов
// dotenv.config()), даже транзитивно — seed.ts импортирует lib/auth.ts (для
// hashPassword), а тот импортирует lib/queries.ts, который импортирует этот
// самый файл. Без ленивой инициализации Pool создавался бы с пустым
// DATABASE_URL ещё до того, как переменные окружения успевали загрузиться.
export const db: ReturnType<typeof drizzle<typeof schema>> = new Proxy(
  {} as ReturnType<typeof drizzle<typeof schema>>,
  {
    get(_target, prop, receiver) {
      return Reflect.get(getDb() as object, prop, receiver);
    },
  }
);
