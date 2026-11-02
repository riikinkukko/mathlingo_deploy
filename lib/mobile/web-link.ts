import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { genId } from "@/lib/queries";

const TTL_MS = 2 * 60_000;

/** Только относительный путь сайта: «/teacher», но не «//evil.com» и не URL. */
export function safeNext(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s.startsWith("/") || s.startsWith("//") || s.includes("\\") || s.length > 300) return "/";
  return s;
}

export async function createWebLink(userId: string, next: string): Promise<string> {
  const id = genId("al");
  await db.insert(schema.appLoginTokens).values({ id, userId, next: safeNext(next), expiresAt: new Date(Date.now() + TTL_MS) });
  return id;
}

/** Погасить ссылку: вернёт пользователя и путь, если токен живой и ещё не использован. */
export async function consumeWebLink(id: string): Promise<{ userId: string; next: string } | null> {
  if (typeof id !== "string" || !id) return null;
  const rows = await db
    .update(schema.appLoginTokens)
    .set({ usedAt: new Date() })
    .where(
      and(eq(schema.appLoginTokens.id, id), isNull(schema.appLoginTokens.usedAt), gt(schema.appLoginTokens.expiresAt, new Date()))
    )
    .returning({ userId: schema.appLoginTokens.userId, next: schema.appLoginTokens.next });
  return rows[0] ?? null;
}
