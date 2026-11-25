import { createHash } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { hashPassword, verifyPassword } from "./auth";
import { db } from "./db/client";
import * as schema from "./db/schema";
import { secureToken } from "./secure-random";
import { lockStudent } from "./student-links";

const kind = "student_credential_handoff";
const digest = (code: string, linkVersion: string) =>
  createHash("sha256").update(linkVersion).update(":").update(code).digest("hex");

/** The platform owner confirms identity and an independent delivery channel before issuing. */
export async function issueStudentHandoff(
  owner: { id: string; isAdmin?: boolean; isPlatformOwner?: boolean }, studentId: string,
) {
  if (!owner.isAdmin || !owner.isPlatformOwner || !studentId) return null;
  return db.transaction(async (tx) => {
    const student = await lockStudent(tx, studentId);
    if (!student || student.independentCredentials) return null;
    await tx.update(schema.authTokens).set({ usedAt: sql`clock_timestamp()` }).where(and(
      eq(schema.authTokens.userId, studentId), eq(schema.authTokens.type, kind), isNull(schema.authTokens.usedAt),
    ));
    const code = secureToken();
    await tx.insert(schema.authTokens).values({
      id: `handoff_${secureToken(16)}`, userId: studentId, type: kind,
      token: digest(code, student.teacherLinkVersion),
      expiresAt: new Date(Date.now() + 30 * 60_000),
    });
    return code;
  });
}

export async function redeemStudentHandoff(studentId: string, code: string, password: string) {
  if (!/^[\w-]{43}$/.test(code) || password.length < 8 || Buffer.byteLength(password, "utf8") > 72) return false;
  const passwordHash = await hashPassword(password);
  return db.transaction(async (tx) => {
    const student = await lockStudent(tx, studentId);
    if (!student || student.independentCredentials || await verifyPassword(password, student.passwordHash)) return false;
    const [claimed] = await tx.update(schema.authTokens).set({ usedAt: sql`clock_timestamp()` }).where(and(
      eq(schema.authTokens.userId, student.id), eq(schema.authTokens.type, kind),
      eq(schema.authTokens.token, digest(code, student.teacherLinkVersion)), isNull(schema.authTokens.usedAt),
      gt(schema.authTokens.expiresAt, sql`clock_timestamp()`),
    )).returning({ id: schema.authTokens.id });
    if (!claimed) return false;

    await tx.update(schema.authTokens).set({ usedAt: sql`clock_timestamp()` }).where(and(
      eq(schema.authTokens.userId, student.id), eq(schema.authTokens.type, "password_reset"),
      isNull(schema.authTokens.usedAt),
    ));
    await tx.update(schema.users).set({
      passwordHash, passwordChangedAt: sql`clock_timestamp()`, credentialHandoffPending: true,
    }).where(eq(schema.users.id, student.id));
    return true;
  });
}
