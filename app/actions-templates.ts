"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { deleteTemplate, saveTemplateFromHomework } from "@/lib/templates";

export type TemplateState = { ok?: boolean; error?: string } | null;

async function teacherOrNull() {
  const u = await getSessionUser();
  return u && u.role === "TEACHER" ? u : null;
}

/** «Сохранить как шаблон» у уже выданного задания. */
export async function saveHomeworkAsTemplateAction(_prev: TemplateState, formData: FormData): Promise<TemplateState> {
  const teacher = await teacherOrNull();
  if (!teacher) return { error: "Нет доступа" };
  const id = await saveTemplateFromHomework(String(formData.get("homeworkId") || ""), teacher.id);
  if (!id) return { error: "Не получилось — проверьте лимит шаблонов" };
  revalidatePath("/teacher/homework/new");
  return { ok: true };
}

export async function deleteTemplateAction(formData: FormData) {
  const teacher = await teacherOrNull();
  if (!teacher) return;
  await deleteTemplate(String(formData.get("templateId") || ""), teacher.id);
  revalidatePath("/teacher/homework/new");
}
