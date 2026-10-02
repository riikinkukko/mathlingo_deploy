"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { genId, getUserById, getStudentPaymentById } from "@/lib/queries";
import { sendPaymentReminder } from "@/lib/payment-reminders";

// Учёт оплат занятий: деньги, которые ученик платит репетитору напрямую.
// Отдельно от actions-payments.ts (там подписка Pro через ЮKassa).

export type AddPaymentState = { ok?: boolean; error?: string; at?: number } | null;

async function ownsStudent(teacherId: string, studentId: string): Promise<boolean> {
  const s = await getUserById(studentId);
  return !!s && s.role === "STUDENT" && s.teacherId === teacherId;
}

function todayMsk(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function revalidateAll(studentId: string) {
  revalidatePath("/teacher");
  revalidatePath("/teacher/payments");
  revalidatePath(`/teacher/student/${studentId}`);
}

type PaymentFields = { amountRub: number; lessonsCount: number; paidAt: string; note: string | null };

/** Общая проверка полей — одинаковая для добавления и редактирования. */
function parsePaymentFields(formData: FormData): PaymentFields | { error: string } {
  const amountRaw = String(formData.get("amountRub") || "").replace(/\s/g, "");
  const amountRub = Number(amountRaw);
  if (!amountRaw || !Number.isInteger(amountRub) || amountRub <= 0 || amountRub > 1_000_000) {
    return { error: "Укажите сумму — целое число рублей больше нуля" };
  }

  const lessonsRaw = String(formData.get("lessonsCount") ?? "1").trim() || "1";
  const lessonsCount = Number(lessonsRaw);
  if (!Number.isInteger(lessonsCount) || lessonsCount < 0 || lessonsCount > 100) {
    return { error: "Количество занятий — от 0 до 100" };
  }

  const paidAtRaw = String(formData.get("paidAt") || "").trim();
  const paidAt = paidAtRaw || todayMsk();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidAt) || isNaN(new Date(paidAt).getTime())) {
    return { error: "Некорректная дата оплаты" };
  }

  const note = String(formData.get("note") || "").trim().slice(0, 200) || null;
  return { amountRub, lessonsCount, paidAt, note };
}

export async function addStudentPaymentAction(
  _prev: AddPaymentState,
  formData: FormData
): Promise<AddPaymentState> {
  const teacher = await getSessionUser();
  const studentId = String(formData.get("studentId") || "");

  if (!teacher || teacher.role !== "TEACHER") return { error: "Доступ запрещён" };
  if (!studentId) return { error: "Выберите ученика" };
  if (!(await ownsStudent(teacher.id, studentId))) return { error: "Ученик не найден" };

  const fields = parsePaymentFields(formData);
  if ("error" in fields) return { error: fields.error };

  await db.insert(schema.studentPayments).values({
    id: genId("sp"),
    teacherId: teacher.id,
    studentId,
    ...fields,
  });

  revalidateAll(studentId);
  return { ok: true, at: Date.now() };
}

/** Правка существующей оплаты. Ученика у оплаты поменять нельзя — только поля. */
export async function updateStudentPaymentAction(
  _prev: AddPaymentState,
  formData: FormData
): Promise<AddPaymentState> {
  const teacher = await getSessionUser();
  if (!teacher || teacher.role !== "TEACHER") return { error: "Доступ запрещён" };

  const paymentId = String(formData.get("paymentId") || "");
  const payment = await getStudentPaymentById(paymentId);
  if (!payment || payment.teacherId !== teacher.id) return { error: "Оплата не найдена" };

  const fields = parsePaymentFields(formData);
  if ("error" in fields) return { error: fields.error };

  await db
    .update(schema.studentPayments)
    .set(fields)
    .where(eq(schema.studentPayments.id, paymentId));

  revalidateAll(payment.studentId);
  return { ok: true, at: Date.now() };
}

export async function deleteStudentPaymentAction(formData: FormData) {
  const teacher = await getSessionUser();
  const paymentId = String(formData.get("paymentId") || "");
  const from = String(formData.get("from") || "payments");

  const payment = await getStudentPaymentById(paymentId);
  const back =
    from === "student" && payment ? `/teacher/student/${payment.studentId}` : "/teacher/payments";

  if (!teacher || teacher.role !== "TEACHER") redirect(`${back}?error=1`);
  if (!payment || payment.teacherId !== teacher.id) redirect(`${back}?error=1`);

  await db.delete(schema.studentPayments).where(eq(schema.studentPayments.id, paymentId));

  revalidateAll(payment.studentId);
  redirect(back);
}

// ---------- Напоминания родителям об оплате ----------

export type ReminderState = { ok?: boolean; error?: string; at?: number; sent?: number } | null;

/** Включить/выключить автонапоминания родителям для конкретного ученика. */
export async function setPaymentRemindersAction(
  _prev: ReminderState,
  formData: FormData
): Promise<ReminderState> {
  const teacher = await getSessionUser();
  const studentId = String(formData.get("studentId") || "");
  if (!teacher || teacher.role !== "TEACHER") return { error: "Доступ запрещён" };
  if (!(await ownsStudent(teacher.id, studentId))) return { error: "Ученик не найден" };

  const enabled = formData.get("enabled") === "on";
  await db
    .update(schema.users)
    .set({ paymentRemindersEnabled: enabled })
    .where(eq(schema.users.id, studentId));
  revalidatePath(`/teacher/student/${studentId}`);
  return { ok: true, at: Date.now() };
}

/** «Как оплатить» — реквизиты репетитора, их видят родители в напоминаниях. */
export async function savePaymentInstructionsAction(
  _prev: ReminderState,
  formData: FormData
): Promise<ReminderState> {
  const teacher = await getSessionUser();
  if (!teacher || teacher.role !== "TEACHER") return { error: "Доступ запрещён" };
  const text = String(formData.get("paymentInstructions") ?? "").trim();
  if (text.length > 300) return { error: "Слишком длинно — до 300 символов" };
  await db
    .update(schema.users)
    .set({ paymentInstructions: text || null })
    .where(eq(schema.users.id, teacher.id));
  revalidatePath("/teacher/payments");
  return { ok: true, at: Date.now() };
}

/** Кнопка «Напомнить об оплате» — отправляет сразу, по текущему балансу. */
export async function sendPaymentReminderNowAction(
  _prev: ReminderState,
  formData: FormData
): Promise<ReminderState> {
  const teacher = await getSessionUser();
  const studentId = String(formData.get("studentId") || "");
  if (!teacher || teacher.role !== "TEACHER") return { error: "Доступ запрещён" };
  if (!(await ownsStudent(teacher.id, studentId))) return { error: "Ученик не найден" };
  const sent = await sendPaymentReminder(teacher.id, studentId, "manual");
  if (sent === 0) return { error: "Не удалось отправить напоминание" };
  return { ok: true, at: Date.now(), sent };
}
