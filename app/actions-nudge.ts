"use server";

import { getSessionUser } from "@/lib/auth";
import { nudgeStudent } from "@/lib/nudge";

export type NudgeState = { ok: true; viaTelegram: boolean } | { error: string } | null;

/** «Напомнить» в кабинете репетитора: ученику, который давно не занимался. */
export async function nudgeStudentAction(_prev: NudgeState, formData: FormData): Promise<NudgeState> {
  const user = await getSessionUser();
  if (!user || user.role !== "TEACHER") return { error: "Нет доступа" };
  const studentId = String(formData.get("studentId") ?? "");
  const r = await nudgeStudent(user.id, studentId);
  if (r.ok) return { ok: true, viaTelegram: r.viaTelegram };
  return { error: r.reason === "too_soon" ? "Уже напоминали за сутки" : "Ученик не найден" };
}
