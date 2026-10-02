import { sql } from "drizzle-orm";
import { db } from "../lib/db/client";
import * as schema from "../lib/db/schema";
import { getUserById } from "../lib/queries";
import type { User } from "../lib/types";

let n = 0;
const RUN = Date.now().toString(36);

/** Временный пользователь; удаляется вместе со всеми данными в cleanup(). */
export async function makeUser(over: Partial<typeof schema.users.$inferInsert> = {}): Promise<User> {
  const id = `t_${RUN}_${++n}`;
  await db.insert(schema.users).values({
    id,
    email: `${id}@test.local`,
    name: over.name ?? `Тест ${n}`,
    role: "STUDENT",
    passwordHash: "x",
    ...over,
  } as typeof schema.users.$inferInsert);
  return (await getUserById(id))!;
}

export async function makeHomework(over: Partial<typeof schema.homeworks.$inferInsert> & { studentId: string; problemIds: string[] }) {
  const id = `th_${RUN}_${++n}`;
  await db.insert(schema.homeworks).values({
    id,
    title: `Тестовое задание ${n}`,
    kind: "homework",
    allowHints: true,
    dueDate: new Date(Date.now() + 86400000),
    ...over,
  } as typeof schema.homeworks.$inferInsert);
  return id;
}

export async function problems(limit: number, skillId = "sk_2") {
  return db.select().from(schema.problems).where(sql`answer_type = 'NUMBER' and skill_id = ${skillId}`).limit(limit);
}

export async function attempt(studentId: string, problemId: string, isCorrect: boolean, at: Date, source: "lesson" | "assignment" = "lesson") {
  await db.insert(schema.attempts).values({ id: `ta_${RUN}_${++n}`, studentId, problemId, answer: "1", isCorrect, source, createdAt: at });
}

/** Стирает всё, что создали тесты этого запуска. */
export async function cleanup() {
  await db.execute(sql`delete from homeworks where id like ${`th_${RUN}_%`}`);
  await db.execute(sql`delete from users where id like ${`t_${RUN}_%`}`);
  // Закрываем пул соединений, иначе процесс теста ждёт ~10 с до таймаута простоя.
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end();
}

export const mskDay = (offsetDays: number, hhmm = "12:00") => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(new Date());
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return new Date(`${d.toISOString().slice(0, 10)}T${hhmm}:00+03:00`);
};
