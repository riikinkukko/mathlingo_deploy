// Приглашения «репетитор → самостоятельный ученик». Ученик зарегистрировался
// сам, потом пришёл к репетитору: привязать чужой аккаунт молча нельзя, поэтому
// репетитор отправляет приглашение, а ученик принимает или отклоняет его.
// При принятии users.teacher_id = репетитор, весь прогресс остаётся.
import { and, eq, isNull, ne, desc, sql } from "drizzle-orm";
import { db } from "./db/client";
import * as schema from "./db/schema";
import { genId, getStudentsOfTeacher, getUserById, pushNotification } from "./queries";
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

async function hasPendingInvite(teacherId: string, studentId: string): Promise<boolean> {
  const rows = await db
    .select({ id: schema.teacherInvites.id })
    .from(schema.teacherInvites)
    .where(
      and(
        eq(schema.teacherInvites.teacherId, teacherId),
        eq(schema.teacherInvites.studentId, studentId),
        eq(schema.teacherInvites.status, "pending")
      )
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Приглашает существующего самостоятельного ученика. Лимит тарифа и
 * подтверждение email репетитора проверяет вызывающий (addStudentAction).
 */
export async function createTeacherInvite(
  teacher: User,
  student: User
): Promise<{ ok: true; inviteId: string } | { ok: false; code: string; message: string }> {
  const check = inviteEligibility(student, teacher.id, await hasPendingInvite(teacher.id, student.id));
  if (!check.ok) return check;
  const inviteId = genId("ti");
  try {
    await db.transaction(async (tx) => {
      await tx.insert(schema.teacherInvites).values({ id: inviteId, teacherId: teacher.id, studentId: student.id });
      await pushNotification(tx, {
        userId: student.id,
        type: "teacher_invite",
        title: `Репетитор ${teacher.name} приглашает тебя заниматься вместе`,
        body: "Прими приглашение на главной — весь твой прогресс сохранится.",
        link: "/student",
      });
    });
  } catch (e) {
    // Гонка двух одинаковых запросов: уникальный индекс на ожидающее приглашение.
    const err = e as { code?: string; cause?: { code?: string } };
    if ((err?.code ?? err?.cause?.code) === "23505") {
      const dup = inviteEligibility(student, teacher.id, true);
      if (!dup.ok) return dup;
    }
    throw e;
  }
  if (isEmailConfigured()) {
    // Письмо — не повод ронять приглашение: ошибку SMTP только логируем.
    sendTeacherInviteEmail(student.email, teacher.name).catch((err) => console.error("teacher invite email:", err));
  }
  return { ok: true, inviteId };
}

/** Репетитор отзывает своё ожидающее приглашение. */
export async function cancelTeacherInvite(teacherId: string, inviteId: string): Promise<boolean> {
  const res = await db
    .update(schema.teacherInvites)
    .set({ status: "declined" })
    .where(
      and(
        eq(schema.teacherInvites.id, inviteId),
        eq(schema.teacherInvites.teacherId, teacherId),
        eq(schema.teacherInvites.status, "pending")
      )
    )
    .returning({ id: schema.teacherInvites.id });
  return res.length > 0;
}

/**
 * Ученик принимает или отклоняет приглашение. Только своё и только ожидающее.
 * Принятие: ученик без репетитора получает teacher_id, остальные его
 * ожидающие приглашения закрываются. Лимит тарифа репетитора проверяется
 * ещё раз — за время ожидания места могли закончиться.
 */
export async function respondToTeacherInvite(
  studentId: string,
  inviteId: string,
  accept: boolean
): Promise<{ ok: true; teacherId: string } | { ok: false; message: string }> {
  const [invite] = await db.select().from(schema.teacherInvites).where(eq(schema.teacherInvites.id, inviteId)).limit(1);
  if (!invite || invite.studentId !== studentId || invite.status !== "pending") {
    return { ok: false, message: "Приглашение не найдено или уже неактуально." };
  }
  const [student, teacher] = await Promise.all([getUserById(studentId), getUserById(invite.teacherId)]);
  if (!student || student.role !== "STUDENT") return { ok: false, message: "Приглашение не найдено или уже неактуально." };

  if (!accept) {
    await db.transaction(async (tx) => {
      await tx
        .update(schema.teacherInvites)
        .set({ status: "declined" })
        .where(and(eq(schema.teacherInvites.id, inviteId), eq(schema.teacherInvites.status, "pending")));
      if (teacher) {
        await pushNotification(tx, {
          userId: teacher.id,
          type: "teacher_invite",
          title: `${student.name} отклонил(а) приглашение`,
          body: "Ученик решил пока заниматься самостоятельно.",
          link: "/teacher",
          telegram: false,
        });
      }
    });
    return { ok: true, teacherId: invite.teacherId };
  }

  if (!teacher || teacher.role !== "TEACHER") return { ok: false, message: "Репетитор больше не пользуется Планиметрикой." };
  if (student.teacherId) return { ok: false, message: "У тебя уже есть репетитор в Планиметрике." };
  if (!teacher.isPlatformOwner) {
    const limitErr = studentLimitError(teacher, (await getStudentsOfTeacher(teacher.id)).length);
    if (limitErr) {
      return {
        ok: false,
        message: `У репетитора ${teacher.name} сейчас нет свободных мест по тарифу. Напиши ему — когда место появится, приглашение можно будет принять.`,
      };
    }
  }

  const linked = await db.transaction(async (tx) => {
    // Условие teacher_id IS NULL — защита от гонки двух принятий подряд.
    const upd = await tx
      .update(schema.users)
      .set({ teacherId: teacher.id })
      .where(and(eq(schema.users.id, studentId), isNull(schema.users.teacherId), eq(schema.users.role, "STUDENT")))
      .returning({ id: schema.users.id });
    if (upd.length === 0) return false;
    await tx.update(schema.teacherInvites).set({ status: "accepted" }).where(eq(schema.teacherInvites.id, inviteId));
    await tx
      .update(schema.teacherInvites)
      .set({ status: "declined" })
      .where(
        and(
          eq(schema.teacherInvites.studentId, studentId),
          eq(schema.teacherInvites.status, "pending"),
          ne(schema.teacherInvites.id, inviteId)
        )
      );
    await pushNotification(tx, {
      userId: teacher.id,
      type: "teacher_invite",
      title: `${student.name} принял(а) приглашение`,
      body: "Ученик теперь в вашем списке — можно задавать домашку и планировать занятия.",
      link: `/teacher/student/${student.id}`,
    });
    return true;
  });
  if (!linked) return { ok: false, message: "У тебя уже есть репетитор в Планиметрике." };
  return { ok: true, teacherId: teacher.id };
}

/** Число ожидающих приглашений (для тестов и счётчиков). */
export async function countPendingInvitesForStudent(studentId: string): Promise<number> {
  const [r] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(schema.teacherInvites)
    .where(and(eq(schema.teacherInvites.studentId, studentId), eq(schema.teacherInvites.status, "pending")));
  return Number(r?.c ?? 0);
}
