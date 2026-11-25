import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "./db/client";
import * as schema from "./db/schema";

export type StudentLinkTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Lock the user before touching any records that depend on the relationship. */
export async function lockStudent(tx: StudentLinkTransaction, studentId: string) {
  const [student] = await tx.select().from(schema.users)
    .where(and(eq(schema.users.id, studentId), eq(schema.users.role, "STUDENT")))
    .for("update");
  return student;
}

/** All multi-student writes acquire the same locks in ID order. */
export async function lockTeacherStudents(
  tx: StudentLinkTransaction, teacherId: string, studentIds: string[], groupId?: string | null
): Promise<string[]> {
  if (!studentIds.length) return [];
  const rows = await tx.select({ id: schema.users.id }).from(schema.users)
    .where(and(inArray(schema.users.id, studentIds), eq(schema.users.role, "STUDENT"), eq(schema.users.teacherId, teacherId)))
    .orderBy(schema.users.id).for("update");
  if (!groupId || !rows.length) return rows.map(({ id }) => id);
  const members = await tx.select({ id: schema.studentGroupMembers.studentId }).from(schema.studentGroupMembers)
    .innerJoin(schema.studentGroups, eq(schema.studentGroupMembers.groupId, schema.studentGroups.id))
    .where(and(eq(schema.studentGroups.id, groupId), eq(schema.studentGroups.teacherId, teacherId),
      inArray(schema.studentGroupMembers.studentId, rows.map(({ id }) => id))))
    .for("share");
  return members.map(({ id }) => id);
}

/** Keep old records available for accounting, outside the next relationship. */
export async function archiveTeacherStudentState(
  tx: StudentLinkTransaction, teacherId: string, studentId: string,
  rates?: { lessonPriceRub: number | null; groupLessonPriceRub: number | null }
) {
  await tx.delete(schema.studentGroupMembers).where(and(
    eq(schema.studentGroupMembers.studentId, studentId),
    inArray(schema.studentGroupMembers.groupId, tx.select({ id: schema.studentGroups.id }).from(schema.studentGroups)
      .where(eq(schema.studentGroups.teacherId, teacherId)))
  ));

  const lessons = and(eq(schema.scheduledLessons.studentId, studentId),
    eq(schema.scheduledLessons.teacherId, teacherId), isNull(schema.scheduledLessons.archivedAt));
  if (rates) {
    const individualPrice = rates.lessonPriceRub ?? 0;
    const groupPrice = rates.groupLessonPriceRub ?? individualPrice;
    await tx.update(schema.scheduledLessons).set({
      priceRub: sql`case when ${schema.scheduledLessons.groupLessonId} is not null
        then ${groupPrice}::integer else ${individualPrice}::integer end`,
    }).where(and(lessons, isNull(schema.scheduledLessons.priceRub), inArray(schema.scheduledLessons.status, ["done", "missed"])));
  }
  await tx.update(schema.scheduledLessons).set({ status: "cancelled" }).where(and(
    lessons, eq(schema.scheduledLessons.status, "planned"), gte(schema.scheduledLessons.startsAt, sql`clock_timestamp()`)
  ));
  await tx.update(schema.scheduledLessons).set({ archivedAt: sql`clock_timestamp()` }).where(lessons);
  await tx.update(schema.studentPayments).set({ archivedAt: sql`clock_timestamp()` }).where(and(
    eq(schema.studentPayments.studentId, studentId), eq(schema.studentPayments.teacherId, teacherId),
    isNull(schema.studentPayments.archivedAt)
  ));
}

export const UNLINK_DENIED = "Ученик или связь не найдены. Обновите карточку.";
export const UNLINK_CLIENT_UPDATE = "Обновите приложение, чтобы безопасно отвязать ученика.";
export const UNLINK_CREDENTIALS = "Попросите ученика задать свой пароль с одноразовым кодом поддержки и затем войти.";

export async function unlinkStudent(
  actor: { id: string; role: string } | null, studentId: string, linkVersion: string,
  legacy = false
): Promise<{ ok: true; changed: boolean } | { ok: false; error: string }> {
  if (actor?.role !== "TEACHER" || !studentId || (!linkVersion && !legacy)) {
    return { ok: false, error: UNLINK_DENIED };
  }
  const teacherId = actor.id;
  return db.transaction(async (tx) => {
    const student = await lockStudent(tx, studentId);
    const pair = and(eq(schema.studentUnlinks.teacherId, teacherId), eq(schema.studentUnlinks.studentId, studentId));
    if (linkVersion && student?.teacherLinkVersion !== linkVersion) {
      const [previous] = await tx.select({ version: schema.studentUnlinks.linkVersion }).from(schema.studentUnlinks)
        .where(and(pair, eq(schema.studentUnlinks.linkVersion, linkVersion))).limit(1);
      return previous ? { ok: true, changed: false } : { ok: false, error: UNLINK_DENIED };
    }
    if (!student || student.teacherId !== teacherId) return { ok: false, error: UNLINK_DENIED };
    if (!linkVersion) {
      const [previous] = await tx.select({ version: schema.studentUnlinks.linkVersion }).from(schema.studentUnlinks)
        .where(pair).limit(1);
      if (previous) return { ok: false, error: UNLINK_CLIENT_UPDATE };
    }
    if (!student.independentCredentials) return { ok: false, error: UNLINK_CREDENTIALS };

    const [updated] = await tx.update(schema.users).set({
      teacherId: null,
      lessonPriceRub: null,
      groupLessonPriceRub: null,
      paymentRemindersEnabled: false,
      nudgedAt: null,
    }).where(and(eq(schema.users.id, studentId), eq(schema.users.role, "STUDENT"),
      eq(schema.users.teacherId, teacherId), eq(schema.users.teacherLinkVersion, student.teacherLinkVersion)))
      .returning({ id: schema.users.id });
    if (!updated) return { ok: false, error: UNLINK_DENIED };

    await archiveTeacherStudentState(tx, teacherId, studentId, student);
    await tx.update(schema.teacherInvites).set({ status: "declined" }).where(and(
      eq(schema.teacherInvites.teacherId, teacherId), eq(schema.teacherInvites.studentId, studentId),
      eq(schema.teacherInvites.status, "pending")
    ));
    await tx.insert(schema.studentUnlinks).values({ linkVersion: student.teacherLinkVersion, teacherId, studentId });
    return { ok: true, changed: true };
  });
}

export type TeacherLink = { studentId: string; teacherId: string; version: string };

export async function teacherLinkFor(
  tx: StudentLinkTransaction, studentId: string, teacherId: string,
): Promise<TeacherLink> {
  const [row] = await tx.select({ version: schema.users.teacherLinkVersion }).from(schema.users)
    .where(and(eq(schema.users.id, studentId), eq(schema.users.teacherId, teacherId)));
  if (!row) throw new Error("Expected an active locked student relationship");
  return { studentId, teacherId, version: row.version };
}

/** Serialize the final provider request with unlink. The provider owns delivery after handoff. */
export async function withActiveTeacherDeliveries<T>(
  links: readonly TeacherLink[], send: (tx: StudentLinkTransaction) => Promise<T>,
): Promise<T | undefined> {
  return db.transaction(async (tx) => {
    const ids = [...new Set(links.map(({ studentId }) => studentId))];
    const students = ids.length ? await tx.select({
      id: schema.users.id, teacherId: schema.users.teacherId, version: schema.users.teacherLinkVersion,
    }).from(schema.users).where(inArray(schema.users.id, ids)).orderBy(schema.users.id).for("update") : [];
    const current = new Map(students.map((student) => [student.id, student]));
    if (links.some((link) => {
      const student = current.get(link.studentId);
      return student?.teacherId !== link.teacherId || student.version !== link.version;
    })) return undefined;
    return send(tx);
  });
}

export async function activeTeacherLinks(teacherId: string, tx: StudentLinkTransaction | typeof db = db): Promise<TeacherLink[]> {
  return tx.select({ studentId: schema.users.id, version: schema.users.teacherLinkVersion }).from(schema.users)
    .where(and(eq(schema.users.role, "STUDENT"), eq(schema.users.teacherId, teacherId)))
    .orderBy(schema.users.id).then((rows) => rows.map((row) => ({ ...row, teacherId })));
}

export async function withUnchangedTeacherRoster<T>(
  teacherId: string, links: TeacherLink[], send: () => Promise<T>,
): Promise<T | undefined> {
  return withActiveTeacherDeliveries(links, async (tx) => {
    const current = await activeTeacherLinks(teacherId, tx);
    if (current.length !== links.length || current.some((row, i) =>
      row.studentId !== links[i].studentId || row.version !== links[i].version
    )) return undefined;
    return send();
  });
}
