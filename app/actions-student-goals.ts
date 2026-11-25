"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { lockTeacherStudents } from "@/lib/student-links";
import * as schema from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { genId, getUserById, getMockScoreById } from "@/lib/queries";

// Этап 4: цель по ЕГЭ, результаты пробников, заметки репетитора.
// Все действия — только для репетитора и только по СВОЕМУ ученику.

export type GoalFormState = { ok?: boolean; error?: string; at?: number } | null;

const NOTES_MAX = 5000;

async function ownStudentOrNull(studentId: string) {
  const teacher = await getSessionUser();
  if (!teacher || teacher.role !== "TEACHER" || !studentId) return null;
  const s = await getUserById(studentId);
  if (!s || s.role !== "STUDENT" || s.teacherId !== teacher.id) return null;
  return { teacher, student: s };
}

function todayMsk(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function revalidateStudent(studentId: string) {
  revalidatePath("/teacher");
  revalidatePath(`/teacher/student/${studentId}`);
}

/**
 * Цель по баллам. Пишем в users.targetScore — то же поле, что заполняет
 * самостоятельный ученик на онбординге, поэтому ученик сразу увидит у себя
 * на главной подсказку по темпу занятий под эту цель. Пустое значение — сброс.
 */
export async function setTargetScoreAction(
  _prev: GoalFormState,
  formData: FormData
): Promise<GoalFormState> {
  const studentId = String(formData.get("studentId") || "");
  const ctx = await ownStudentOrNull(studentId);
  if (!ctx) return { error: "Ученик не найден" };

  const raw = String(formData.get("targetScore") ?? "").trim();
  let targetScore: number | null = null;
  if (raw !== "") {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 100) {
      return { error: "Цель — целое число от 1 до 100 баллов" };
    }
    targetScore = n;
  }

  const [updated] = await db.update(schema.users).set({ targetScore }).where(and(
    eq(schema.users.id, studentId), eq(schema.users.role, "STUDENT"), eq(schema.users.teacherId, ctx.teacher.id)
  )).returning({ id: schema.users.id });
  if (!updated) return { error: "Ученик не найден" };
  revalidateStudent(studentId);
  return { ok: true, at: Date.now() };
}

export async function addMockScoreAction(
  _prev: GoalFormState,
  formData: FormData
): Promise<GoalFormState> {
  const studentId = String(formData.get("studentId") || "");
  const ctx = await ownStudentOrNull(studentId);
  if (!ctx) return { error: "Ученик не найден" };

  const raw = String(formData.get("score") ?? "").trim();
  const score = Number(raw);
  if (raw === "" || !Number.isInteger(score) || score < 0 || score > 100) {
    return { error: "Балл — целое число от 0 до 100" };
  }

  const takenAt = String(formData.get("takenAt") || "").trim() || todayMsk();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(takenAt) || isNaN(new Date(takenAt).getTime())) {
    return { error: "Некорректная дата пробника" };
  }
  const note = String(formData.get("note") || "").trim().slice(0, 200) || null;

  const added = await db.transaction(async (tx) => {
    if (!(await lockTeacherStudents(tx, ctx.teacher.id, [studentId])).length) return false;
    await tx.insert(schema.mockScores).values({
      id: genId("ms"),
      teacherId: ctx.teacher.id,
      studentId,
      score,
      takenAt,
      note,
    });
    return true;
  });
  if (!added) return { error: "Ученик не найден" };
  revalidateStudent(studentId);
  return { ok: true, at: Date.now() };
}

export async function deleteMockScoreAction(formData: FormData) {
  const teacher = await getSessionUser();
  const id = String(formData.get("mockId") || "");
  const mock = await getMockScoreById(id);
  if (!teacher || teacher.role !== "TEACHER" || !mock || mock.teacherId !== teacher.id) redirect("/teacher?error=1");
  const back = `/teacher/student/${mock.studentId}`;

  const removed = await db.transaction(async (tx) => {
    if (!(await lockTeacherStudents(tx, teacher.id, [mock.studentId])).length) return [];
    return tx.delete(schema.mockScores).where(and(eq(schema.mockScores.id, id), eq(schema.mockScores.teacherId, teacher.id)))
      .returning({ id: schema.mockScores.id });
  });
  if (!removed.length) redirect("/teacher?error=1");
  revalidateStudent(mock.studentId);
  redirect(back);
}

export async function saveStudentNotesAction(
  _prev: GoalFormState,
  formData: FormData
): Promise<GoalFormState> {
  const studentId = String(formData.get("studentId") || "");
  const ctx = await ownStudentOrNull(studentId);
  if (!ctx) return { error: "Ученик не найден" };

  const notes = String(formData.get("notes") ?? "");
  if (notes.length > NOTES_MAX) {
    return { error: `Слишком длинные заметки — максимум ${NOTES_MAX} символов` };
  }

  const changed = await db.transaction(async (tx) => {
    if (!(await lockTeacherStudents(tx, ctx.teacher.id, [studentId])).length) return false;
    await tx
      .insert(schema.studentNotes)
      .values({ studentId, teacherId: ctx.teacher.id, notes, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [schema.studentNotes.studentId, schema.studentNotes.teacherId],
        set: { notes, updatedAt: new Date() },
      });
    return true;
  });
  if (!changed) return { error: "Ученик не найден" };
  revalidatePath(`/teacher/student/${studentId}`);
  return { ok: true, at: Date.now() };
}

export type DreamState = { ok?: boolean; at?: number; error?: string } | null;

/**
 * «Вуз мечты» на странице ученика. Цель по баллам ученик меняет сам, только
 * если у него нет репетитора: у ученика репетитора цель ставит репетитор.
 */
export async function saveDreamAction(_prev: DreamState, formData: FormData): Promise<DreamState> {
  const user = await getSessionUser();
  if (!user || user.role !== "STUDENT") return { error: "Нет доступа" };
  const dream = String(formData.get("dreamUniversity") ?? "").trim().slice(0, 120) || null;
  const set: { dreamUniversity: string | null; targetScore?: number | null } = { dreamUniversity: dream };
  if (!user.teacherId && formData.has("targetScore")) {
    const raw = String(formData.get("targetScore") ?? "").trim();
    if (raw === "") set.targetScore = null;
    else {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > 100) return { error: "Цель — число от 1 до 100" };
      set.targetScore = n;
    }
  }
  await db.update(schema.users).set(set).where(eq(schema.users.id, user.id));
  revalidatePath("/student/profile");
  revalidatePath("/student");
  return { ok: true, at: Date.now() };
}
