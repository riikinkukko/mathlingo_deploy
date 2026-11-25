// Приглашения «репетитор → самостоятельный ученик». Ученик зарегистрировался
// сам, потом пришёл к репетитору: привязать чужой аккаунт молча нельзя, поэтому
// репетитор отправляет приглашение, а ученик принимает или отклоняет его.
// При принятии users.teacher_id = репетитор, весь прогресс остаётся.
import { and, eq, isNull, ne, desc, sql } from "drizzle-orm";
import { db } from "./db/client";
import * as schema from "./db/schema";
import { genId, mapUserRow, pushNotification } from "./queries";
import { archiveTeacherStudentState, lockStudent } from "./student-links";
import { teacherPlanState, TEACHER_TIERS } from "./teacher-plan";
import { isEmailConfigured, sendTeacherInviteEmail } from "./email";
import type { User } from "./types";

// ---------- Чистые проверки (без базы — покрыты юнит-тестами) ----------

export type InviteCheck =
  | { ok: true }
  | { ok: false; code: "same_teacher" | "has_teacher" | "not_student" | "already_invited"; message: string };

/** Можно ли пригласить владельца этого email. */
export function inviteEligibility(
  existing: Pick<User, "role" | "teacherId">,
  teacherId: string,
  hasPendingInvite: boolean
): InviteCheck {
  if (existing.role !== "STUDENT")
    return {
      ok: false,
      code: "not_student",
      message: "Этот email занят аккаунтом репетитора или родителя — пригласить его как ученика нельзя.",
    };
  if (existing.teacherId === teacherId)
    return { ok: false, code: "same_teacher", message: "Этот ученик уже есть в вашем списке." };
  if (existing.teacherId)
    return {
      ok: false,
      code: "has_teacher",
      message: "Этот ученик уже занимается с другим репетитором в Планиметрике — пригласить его нельзя.",
    };
  if (hasPendingInvite)
    return {
      ok: false,
      code: "already_invited",
      message: "Приглашение этому ученику уже отправлено — ждём, когда он его примет.",
    };
  return { ok: true };
}

/**
 * Сколько учеников можно добавить, не подтвердив email. Раньше было 0 — и
 * новый репетитор упирался в стену с первой минуты (письмо могло не дойти).
 * На пробном «Профи» почта не нужна вовсе: репетитор решает в первые минуты,
 * а письмо может уйти в спам (критика репетитора со стажем — 14 учеников).
 * После пробного без подтверждения — только двое (анти-абуз: иначе 10
 * выдуманных адресов дали бы 30 бесплатных мест).
 */
export const UNVERIFIED_STUDENT_LIMIT = 2;

/** Нужно ли подтвердить email, чтобы добавить ещё ученика. */
export function needsEmailForMoreStudents(
  teacher: { emailVerifiedAt?: string | null; isPlatformOwner?: boolean | null } & Parameters<typeof teacherPlanState>[0],
  currentCount: number,
  paidActive: boolean
): boolean {
  if (teacher.isPlatformOwner || paidActive || teacher.emailVerifiedAt) return false;
  if (teacherPlanState(teacher).source === "trial") return false;
  return currentCount >= UNVERIFIED_STUDENT_LIMIT;
}

export const EMAIL_FOR_MORE_STUDENTS_TEXT = `Без подтверждения email можно добавить ${UNVERIFIED_STUDENT_LIMIT} учеников. Подтвердите почту — ссылка в письме после регистрации, письмо можно отправить ещё раз.`;

/** Текст ошибки, если у репетитора кончились места по тарифу; null — место есть. */
export function studentLimitError(
  teacher: Parameters<typeof teacherPlanState>[0],
  currentCount: number
): string | null {
  const plan = teacherPlanState(teacher);
  if (!Number.isFinite(plan.limit) || currentCount < plan.limit) return null;
  return plan.tier === "free"
    ? `На бесплатном тарифе — до ${plan.limit} учеников. Чтобы добавить ещё, выберите тариф.`
    : `На тарифе «${TEACHER_TIERS[plan.tier].name}» — до ${plan.limit} учеников. Для большего числа — «Профи».`;
}

// ---------- Работа с базой ----------

export interface TeacherInviteRow {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  createdAt: string;
}

export interface StudentInviteRow {
  id: string;
  teacherId: string;
  teacherName: string;
  createdAt: string;
}

export async function getPendingInvitesForTeacher(teacherId: string): Promise<TeacherInviteRow[]> {
  const rows = await db
    .select({
      id: schema.teacherInvites.id,
      studentId: schema.teacherInvites.studentId,
      studentName: schema.users.name,
      studentEmail: schema.users.email,
      createdAt: schema.teacherInvites.createdAt,
    })
    .from(schema.teacherInvites)
    .innerJoin(schema.users, eq(schema.users.id, schema.teacherInvites.studentId))
    .where(and(eq(schema.teacherInvites.teacherId, teacherId), eq(schema.teacherInvites.status, "pending")))
    .orderBy(desc(schema.teacherInvites.createdAt));
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

export async function getPendingInvitesForStudent(studentId: string): Promise<StudentInviteRow[]> {
  const rows = await db
    .select({
      id: schema.teacherInvites.id,
      teacherId: schema.teacherInvites.teacherId,
      teacherName: schema.users.name,
      createdAt: schema.teacherInvites.createdAt,
    })
    .from(schema.teacherInvites)
    .innerJoin(schema.users, eq(schema.users.id, schema.teacherInvites.teacherId))
    .where(and(eq(schema.teacherInvites.studentId, studentId), eq(schema.teacherInvites.status, "pending")))
    .orderBy(desc(schema.teacherInvites.createdAt));
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

/** Лимит тарифа и подтверждение email проверяет вызывающий. */
export async function createTeacherInvite(
  teacher: User,
  student: User
): Promise<{ ok: true; inviteId: string } | { ok: false; code: string; message: string }> {
  const inviteId = genId("ti");
  const result = await db.transaction(async (tx) => {
    const current = await lockStudent(tx, student.id);
    if (!current) return { ok: false as const, code: "not_student", message: "Ученик не найден." };
    const [pending] = await tx.select({ id: schema.teacherInvites.id }).from(schema.teacherInvites)
      .where(and(eq(schema.teacherInvites.studentId, student.id), eq(schema.teacherInvites.teacherId, teacher.id),
        eq(schema.teacherInvites.status, "pending"))).limit(1);
    const check = inviteEligibility({ ...current, teacherId: current.teacherId ?? undefined }, teacher.id, !!pending);
    if (!check.ok) return check;
    await tx.insert(schema.teacherInvites).values({ id: inviteId, teacherId: teacher.id, studentId: student.id });
    await pushNotification(tx, {
      userId: student.id,
      type: "teacher_invite",
      title: `Репетитор ${teacher.name} приглашает тебя заниматься вместе`,
      body: "Прими приглашение на главной — весь твой прогресс сохранится.",
      link: "/student",
    });
    return { ok: true as const };
  });
  if (!result.ok) return result;
  if (isEmailConfigured()) {
    sendTeacherInviteEmail(student.email, teacher.name).catch((err) => console.error("teacher invite email:", err));
  }
  return { ok: true, inviteId };
}

export async function cancelTeacherInvite(teacherId: string, inviteId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [invite] = await tx.select({ studentId: schema.teacherInvites.studentId }).from(schema.teacherInvites)
      .where(and(eq(schema.teacherInvites.id, inviteId), eq(schema.teacherInvites.teacherId, teacherId)));
    if (!invite || !(await lockStudent(tx, invite.studentId))) return false;
    const updated = await tx.update(schema.teacherInvites).set({ status: "declined" }).where(and(
      eq(schema.teacherInvites.id, inviteId), eq(schema.teacherInvites.teacherId, teacherId),
      eq(schema.teacherInvites.status, "pending")
    )).returning({ id: schema.teacherInvites.id });
    return updated.length > 0;
  });
}

export async function respondToTeacherInvite(
  studentId: string,
  inviteId: string,
  accept: boolean
): Promise<{ ok: true; teacherId: string } | { ok: false; message: string }> {
  return db.transaction(async (tx) => {
    const student = await lockStudent(tx, studentId);
    const pending = and(eq(schema.teacherInvites.id, inviteId), eq(schema.teacherInvites.studentId, studentId),
      eq(schema.teacherInvites.status, "pending"));
    const [invite] = await tx.select().from(schema.teacherInvites).where(pending);
    if (!student || !invite) return { ok: false, message: "Приглашение не найдено или уже неактуально." };

    if (!accept) {
      await tx.update(schema.teacherInvites).set({ status: "declined" }).where(pending);
      await pushNotification(tx, {
        userId: invite.teacherId,
        type: "teacher_invite",
        title: `${student.name} отклонил(а) приглашение`,
        body: "Ученик решил пока заниматься самостоятельно.",
        link: "/teacher",
        telegram: false,
      });
      return { ok: true, teacherId: invite.teacherId };
    }

    if (student.teacherId) return { ok: false, message: "У тебя уже есть репетитор в Планиметрике." };
    // Serialize simultaneous acceptances for the teacher's tariff limit.
    const [teacherRow] = await tx.select().from(schema.users)
      .where(and(eq(schema.users.id, invite.teacherId), eq(schema.users.role, "TEACHER"))).for("no key update");
    if (!teacherRow) return { ok: false, message: "Репетитор больше не пользуется Планиметрикой." };
    const teacher = mapUserRow(teacherRow);
    if (!teacher.isPlatformOwner) {
      const [count] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.users)
        .where(and(eq(schema.users.teacherId, teacher.id), eq(schema.users.role, "STUDENT")));
      if (studentLimitError(teacher, count.n)) {
        return {
          ok: false,
          message: `У репетитора ${teacher.name} сейчас нет свободных мест по тарифу. Напиши ему — когда место появится, приглашение можно будет принять.`,
        };
      }
    }

    const [linked] = await tx.update(schema.users).set({ teacherId: teacher.id })
      .where(and(eq(schema.users.id, studentId), isNull(schema.users.teacherId), eq(schema.users.role, "STUDENT")))
      .returning({ id: schema.users.id });
    if (!linked) return { ok: false, message: "У тебя уже есть репетитор в Планиметрике." };
    // Older records for this pair may predate unlink tracking. Never reactivate them.
    await archiveTeacherStudentState(tx, teacher.id, studentId);
    await tx.update(schema.teacherInvites).set({ status: "accepted" }).where(pending);
    await tx.update(schema.teacherInvites).set({ status: "declined" }).where(and(
      eq(schema.teacherInvites.studentId, studentId), eq(schema.teacherInvites.status, "pending"),
      ne(schema.teacherInvites.id, inviteId)
    ));
    await pushNotification(tx, {
      userId: teacher.id,
      type: "teacher_invite",
      title: `${student.name} принял(а) приглашение`,
      body: "Ученик теперь в вашем списке — можно задавать домашку и планировать занятия.",
      link: `/teacher/student/${student.id}`,
    });
    return { ok: true, teacherId: teacher.id };
  });
}

/** Число ожидающих приглашений (для тестов и счётчиков). */
export async function countPendingInvitesForStudent(studentId: string): Promise<number> {
  const [r] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(schema.teacherInvites)
    .where(and(eq(schema.teacherInvites.studentId, studentId), eq(schema.teacherInvites.status, "pending")));
  return Number(r?.c ?? 0);
}
