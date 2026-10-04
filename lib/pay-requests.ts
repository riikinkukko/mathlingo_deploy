// «Попросить родителя»: ученик без репетитора отправляет взрослому ссылку
// /pay/<token>, по которой тот оплачивает ему Pro без своего аккаунта.
// Ссылка действует 14 дней; пока действует — ученику выдаётся та же самая.
import { and, eq, gt } from "drizzle-orm";
import { db } from "./db/client";
import * as schema from "./db/schema";
import { getUserById } from "./queries";
import type { User } from "./types";

const TTL_MS = 14 * 86_400_000;
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export async function getOrCreatePayRequest(studentId: string, now: Date = new Date()): Promise<string> {
  const [existing] = await db
    .select({ token: schema.payRequests.token })
    .from(schema.payRequests)
    .where(and(eq(schema.payRequests.studentId, studentId), gt(schema.payRequests.expiresAt, new Date(now.getTime() + 86_400_000))))
    .limit(1);
  if (existing) return existing.token;
  const token = newToken();
  await db.insert(schema.payRequests).values({ token, studentId, expiresAt: new Date(now.getTime() + TTL_MS) });
  return token;
}

/** Действующая ссылка и ученик, которому она платит (null — нет/истекла/не тот ученик). */
export async function getPayRequest(token: string, now: Date = new Date()): Promise<{ student: User; expiresAt: Date } | null> {
  if (!/^[a-z2-9]{20}$/.test(token)) return null;
  const [req] = await db.select().from(schema.payRequests).where(eq(schema.payRequests.token, token)).limit(1);
  if (!req || req.expiresAt.getTime() <= now.getTime()) return null;
  const student = await getUserById(req.studentId);
  // Ученик мог за это время перейти к репетитору — тогда платить уже не нужно.
  if (!student || student.role !== "STUDENT" || student.teacherId) return null;
  return { student, expiresAt: req.expiresAt };
}
