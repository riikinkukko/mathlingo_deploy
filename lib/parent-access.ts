import { createHash } from "node:crypto";
import { and, eq, gt, isNull, like, or, sql } from "drizzle-orm";
import { hashPassword, verifyPassword } from "./auth";
import { db } from "./db/client";
import * as schema from "./db/schema";
import { secureToken } from "./secure-random";
import { lockStudent, withDeliveryLocks } from "./student-links";

const prefix = "parent_link:";
const digest = (code: string) => createHash("sha256").update(code).digest("hex");

export async function issueParentAccess(
  operator: { id: string; isAdmin?: boolean; isPlatformOwner?: boolean },
  studentId: string,
  parentId: string,
) {
  if (!operator.isAdmin || !operator.isPlatformOwner) return null;
  return db.transaction(async (tx) => {
    const student = await lockStudent(tx, studentId);
    if (!student || student.teacherId === operator.id) return null;
    const [formerTeacher] = await tx.select({ id: schema.studentUnlinks.linkVersion })
      .from(schema.studentUnlinks).where(and(eq(schema.studentUnlinks.studentId, studentId),
        eq(schema.studentUnlinks.teacherId, operator.id))).limit(1);
    if (formerTeacher) return null;
    const [parent] = await tx.select().from(schema.users)
      .where(and(eq(schema.users.id, parentId), eq(schema.users.role, "PARENT"))).for("update");
    if (!parent) return null;
    const type = prefix + studentId;
    const [link] = await tx.select().from(schema.parentLinkRequests)
      .where(and(eq(schema.parentLinkRequests.parentId, parentId),
        eq(schema.parentLinkRequests.studentId, studentId), isNull(schema.parentLinkRequests.verifiedAt)));
    if (!link) return null;
    await tx.update(schema.authTokens).set({ usedAt: sql`clock_timestamp()` }).where(and(
      eq(schema.authTokens.userId, parentId), eq(schema.authTokens.type, type), isNull(schema.authTokens.usedAt),
    ));
    const code = secureToken();
    await tx.insert(schema.authTokens).values({
      id: secureToken(16), userId: parentId, type, token: digest(code), expiresAt: new Date(Date.now() + 30 * 60_000),
    });
    return { code, email: parent.email };
  });
}

export async function confirmParentAccess(code: string, password: string) {
  if (!/^[\w-]{43}$/.test(code) || password.length < 8 || Buffer.byteLength(password, "utf8") > 72) return false;
  const token = digest(code);
  const [request] = await db.select().from(schema.authTokens).where(and(
    eq(schema.authTokens.token, token), like(schema.authTokens.type, prefix + "%"),
    isNull(schema.authTokens.usedAt), gt(schema.authTokens.expiresAt, sql`clock_timestamp()`),
  ));
  if (!request) return false;
  const studentId = request.type.slice(prefix.length);
  const passwordHash = await hashPassword(password);
  return withDeliveryLocks([request.userId], false, (connection) => connection.transaction(async (tx) => {
    const [parent] = await tx.select().from(schema.users)
      .where(and(eq(schema.users.id, request.userId), eq(schema.users.role, "PARENT"))).for("update");
    if (!parent || await verifyPassword(password, parent.passwordHash)) return false;
    const [claimed] = await tx.update(schema.authTokens).set({ usedAt: sql`clock_timestamp()` }).where(and(
      eq(schema.authTokens.id, request.id), isNull(schema.authTokens.usedAt), gt(schema.authTokens.expiresAt, sql`clock_timestamp()`),
    )).returning({ id: schema.authTokens.id });
    if (!claimed) return false;
    const [link] = await tx.update(schema.parentLinkRequests).set({ verifiedAt: sql`clock_timestamp()` })
      .where(and(eq(schema.parentLinkRequests.parentId, parent.id),
        eq(schema.parentLinkRequests.studentId, studentId), isNull(schema.parentLinkRequests.verifiedAt)))
      .returning({ studentId: schema.parentLinkRequests.studentId });
    if (!link) throw new Error("Pending parent link disappeared during confirmation");
    await tx.update(schema.authTokens).set({ usedAt: sql`clock_timestamp()` }).where(and(
      eq(schema.authTokens.userId, parent.id), isNull(schema.authTokens.usedAt),
      or(eq(schema.authTokens.type, "password_reset"), like(schema.authTokens.type, prefix + "%")),
    ));
    await tx.update(schema.users).set({
      passwordHash, passwordChangedAt: sql`clock_timestamp()`, emailVerifiedAt: sql`clock_timestamp()`,
      consentGivenAt: sql`clock_timestamp()`, telegramChatId: null, telegramLinkCode: null,
    }).where(eq(schema.users.id, parent.id));
    await tx.delete(schema.pushTokens).where(eq(schema.pushTokens.userId, parent.id));
    return true;
  }));
}
