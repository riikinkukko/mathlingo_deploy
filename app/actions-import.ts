"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { displayLogin, isLoginOnlyEmail } from "@/lib/email";
import { generatePassword } from "@/lib/secure-random";
import { getSessionUser, hashPassword } from "@/lib/auth";
import { getStudentsOfTeacher } from "@/lib/queries";
import { isTeacherPaidActive, teacherPlanState } from "@/lib/teacher-plan";
import { UNVERIFIED_STUDENT_LIMIT } from "@/lib/teacher-invites";
import { createStudentForTeacher, parseImport, type ImportRow } from "@/lib/student-accounts";

export type ImportState = {
  error?: string;
  rows?: ImportRow[];
  /** сколько ещё можно добавить по тарифу / без подтверждения почты; null — без ограничений */
  room?: number | null;
  created?: { name: string; login: string; password: string; loginOnly: boolean }[];
  skipped?: { name: string; reason: string }[];
} | null;

/** Сколько учеников ещё можно добавить сейчас (тариф и подтверждение почты). */
async function roomFor(teacher: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>): Promise<number | null> {
  const count = (await getStudentsOfTeacher(teacher.id)).length;
  const plan = teacherPlanState(teacher);
  let room: number | null = Number.isFinite(plan.limit) && !teacher.isPlatformOwner ? Math.max(0, plan.limit - count) : null;
  const paid = isTeacherPaidActive(teacher);
  if (!teacher.emailVerifiedAt && !teacher.isPlatformOwner && !paid && plan.source !== "trial") {
    const byEmail = Math.max(0, UNVERIFIED_STUDENT_LIMIT - count);
    room = room === null ? byEmail : Math.min(room, byEmail);
  }
  return room;
}

/**
 * Импорт учеников списком. step=preview — только разобрать и показать;
 * step=create — создать (нужна галочка согласия). Ученики с занятым email
 * пропускаются — их можно пригласить по одному из формы.
 */
export async function importStudentsAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const teacher = await getSessionUser();
  if (!teacher || teacher.role !== "TEACHER") return { error: "Доступ запрещён" };
  const text = String(formData.get("list") || "").slice(0, 20_000);
  const rows = parseImport(text);
  if (!rows.length) return { error: "Вставьте список: каждая строка — ученик (имя, дальше по желанию email, класс, цена)." };
  const room = await roomFor(teacher);
  // Повторы: ученик с таким именем уже есть или встречается в списке выше.
  const seen = new Set((await getStudentsOfTeacher(teacher.id)).map((s) => s.name.trim().toLowerCase()));
  for (const r of rows) {
    if (r.error) continue;
    const key = r.name.trim().toLowerCase();
    if (seen.has(key)) r.duplicate = true;
    seen.add(key);
  }
  if (formData.get("step") !== "create") return { rows, room };

  if (formData.get("consent") !== "on") return { rows, room, error: "Подтвердите, что согласие учеников (или их представителей) получено." };
  const good = rows.filter((r) => !r.error && !r.duplicate);
  const allowed = room === null ? good : good.slice(0, room);
  const created: NonNullable<ImportState>["created"] = [];
  const skipped: NonNullable<ImportState>["skipped"] = rows.filter((r) => r.error).map((r) => ({ name: r.name, reason: r.error! }));
  for (const r of rows.filter((x) => !x.error && x.duplicate)) skipped.push({ name: r.name, reason: "Уже есть в списке учеников" });
  for (const r of good.slice(allowed.length)) skipped.push({ name: r.name, reason: "Не хватило мест по тарифу" });
  for (const r of allowed) {
    const res = await createStudentForTeacher(teacher, { name: r.name, email: r.email, grade: r.grade, lessonPriceRub: r.price });
    if (res.ok) created.push({ name: res.name, login: displayLogin(res.email), password: res.password, loginOnly: res.loginOnly });
    else skipped.push({ name: r.name, reason: res.existing ? "Email уже зарегистрирован — пригласите через форму" : res.error });
  }
  revalidatePath("/teacher");
  return { created, skipped };
}

export type ResetPasswordState = { error?: string; login?: string; password?: string } | null;

/**
 * Новый пароль ученику, заведённому без почты (вход по логину): восстановить
 * пароль по email он не может, поэтому выдаёт репетитор. Ученикам с почтой —
 * только «Забыли пароль?» на входе (аккаунт может быть их собственным).
 */
export async function resetStudentPasswordAction(_prev: ResetPasswordState, formData: FormData): Promise<ResetPasswordState> {
  const teacher = await getSessionUser();
  if (!teacher || teacher.role !== "TEACHER") return { error: "Доступ запрещён" };
  const studentId = String(formData.get("studentId") || "");
  const [st] = await db
    .select({ id: schema.users.id, email: schema.users.email, linkVersion: schema.users.teacherLinkVersion })
    .from(schema.users)
    .where(and(eq(schema.users.id, studentId), eq(schema.users.role, "STUDENT"), eq(schema.users.teacherId, teacher.id)))
    .limit(1);
  if (!st) return { error: "Ученик не найден" };
  if (!isLoginOnlyEmail(st.email)) return { error: "Ученик входит по email — пусть нажмёт «Забыли пароль?» на странице входа." };
  const password = generatePassword();
  const [updated] = await db.update(schema.users)
    .set({ passwordHash: await hashPassword(password), passwordChangedAt: new Date() })
    .where(and(eq(schema.users.id, st.id), eq(schema.users.role, "STUDENT"), eq(schema.users.teacherId, teacher.id),
      eq(schema.users.teacherLinkVersion, st.linkVersion), eq(schema.users.independentCredentials, false),
      eq(schema.users.credentialHandoffPending, false)))
    .returning({ id: schema.users.id });
  if (!updated) return { error: "Связь изменилась или ученик уже задал свой пароль." };
  return { login: displayLogin(st.email), password };
}
