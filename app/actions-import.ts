"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth";
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
  if (formData.get("step") !== "create") return { rows, room };

  if (formData.get("consent") !== "on") return { rows, room, error: "Подтвердите, что согласие учеников (или их представителей) получено." };
  const good = rows.filter((r) => !r.error);
  const allowed = room === null ? good : good.slice(0, room);
  const created: NonNullable<ImportState>["created"] = [];
  const skipped: NonNullable<ImportState>["skipped"] = rows.filter((r) => r.error).map((r) => ({ name: r.name, reason: r.error! }));
  for (const r of good.slice(allowed.length)) skipped.push({ name: r.name, reason: "Не хватило мест по тарифу" });
  for (const r of allowed) {
    const res = await createStudentForTeacher(teacher, { name: r.name, email: r.email, grade: r.grade, lessonPriceRub: r.price });
    if (res.ok) created.push({ name: res.name, login: res.email, password: res.password, loginOnly: res.loginOnly });
    else skipped.push({ name: r.name, reason: res.existing ? "Email уже зарегистрирован — пригласите через форму" : res.error });
  }
  revalidatePath("/teacher");
  return { created, skipped };
}
