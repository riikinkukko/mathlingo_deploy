"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import {
  createChapter,
  updateChapter,
  createSkill,
  updateSkill,
  createProblem,
  updateProblem,
  deleteProblemSafely,
  countAttemptsForProblem,
  ProblemInput,
} from "@/lib/queries";
import { AnswerType, Skill } from "@/lib/types";

async function requireTeacher() {
  const user = await getSessionUser();
  if (!user || user.role !== "TEACHER") {
    redirect("/login");
  }
  return user!;
}

// ---------- Главы ----------

export async function createChapterAction(formData: FormData) {
  await requireTeacher();
  const title = String(formData.get("title") || "").trim();
  const order = parseInt(String(formData.get("order") || "1"), 10) || 1;
  if (!title) redirect(`/teacher/content?error=1`);

  await createChapter(title, order);
  revalidatePath("/teacher/content");
  redirect("/teacher/content");
}

export async function updateChapterAction(formData: FormData) {
  await requireTeacher();
  const id = String(formData.get("id") || "");
  const title = String(formData.get("title") || "").trim();
  const order = parseInt(String(formData.get("order") || "1"), 10) || 1;
  if (!id || !title) redirect(`/teacher/content?error=1`);

  await updateChapter(id, { title, order });
  revalidatePath("/teacher/content");
  redirect("/teacher/content");
}

// ---------- Навыки ----------

function parseTheoryCards(raw: string): Skill["theoryCards"] {
  try {
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c) => c && typeof c === "object" && c.title && c.body);
  } catch {
    return [];
  }
}

export async function createSkillAction(formData: FormData) {
  await requireTeacher();
  const subtopicId = String(formData.get("subtopicId") || "");
  const title = String(formData.get("title") || "").trim();
  const order = parseInt(String(formData.get("order") || "1"), 10) || 1;
  const theoryCards = parseTheoryCards(String(formData.get("theoryCards") || "[]"));
  if (!subtopicId || !title || theoryCards.length === 0) {
    redirect(`/teacher/content?error=1`);
  }

  const id = await createSkill(subtopicId, { title, order, theoryCards });
  revalidatePath("/teacher/content");
  redirect(`/teacher/content/skill/${id}`);
}

export async function updateSkillAction(formData: FormData) {
  await requireTeacher();
  const id = String(formData.get("id") || "");
  const title = String(formData.get("title") || "").trim();
  const order = parseInt(String(formData.get("order") || "1"), 10) || 1;
  const theoryCards = parseTheoryCards(String(formData.get("theoryCards") || "[]"));
  if (!id || !title || theoryCards.length === 0) {
    redirect(`/teacher/content/skill/${id}?error=1`);
  }

  await updateSkill(id, { title, order, theoryCards });
  revalidatePath("/teacher/content");
  revalidatePath(`/teacher/content/skill/${id}`);
  redirect(`/teacher/content/skill/${id}`);
}

// ---------- Задачи ----------

function buildProblemInput(formData: FormData, skillId: string | null): ProblemInput {
  const answerType = String(formData.get("answerType") || "NUMBER") as AnswerType;
  const hintsRaw = String(formData.get("hints") || "");
  const hints = hintsRaw
    .split("\n")
    .map((h) => h.trim())
    .filter(Boolean);
  const diagramRaw = String(formData.get("diagram") || "").trim();
  let diagram: ProblemInput["diagram"] = undefined;
  if (diagramRaw) {
    try {
      diagram = JSON.parse(diagramRaw);
    } catch {
      diagram = undefined; // некорректный JSON — молча игнорируем диаграмму, не роняем сохранение всей задачи
    }
  }
  const egeRaw = String(formData.get("egeTaskNumber") || "").trim();
  const tierRaw = String(formData.get("tier") || "core");

  return {
    skillId,
    text: String(formData.get("text") || "").trim(),
    answerType,
    correctAnswer: String(formData.get("correctAnswer") || "").trim(),
    choices: undefined,
    diagram,
    keyFormula: String(formData.get("keyFormula") || "").trim() || null,
    hints: hints.length > 0 ? hints : ["Внимательно перечитайте условие ещё раз."],
    explanation: String(formData.get("explanation") || "").trim(),
    difficulty: (parseInt(String(formData.get("difficulty") || "2"), 10) || 2) as 1 | 2 | 3,
    egeTaskNumber: egeRaw ? parseInt(egeRaw, 10) : null,
    tier: tierRaw === "bank" ? "bank" : "core",
  };
}

export async function createProblemAction(formData: FormData) {
  await requireTeacher();
  const skillId = String(formData.get("skillId") || "");
  const input = buildProblemInput(formData, skillId || null);
  if (!skillId || !input.text || !input.correctAnswer || !input.explanation) {
    redirect(`/teacher/content/skill/${skillId}?error=1`);
  }

  await createProblem(input);
  revalidatePath(`/teacher/content/skill/${skillId}`);
  redirect(`/teacher/content/skill/${skillId}`);
}

export async function updateProblemAction(formData: FormData) {
  await requireTeacher();
  const id = String(formData.get("id") || "");
  const skillId = String(formData.get("skillId") || "");
  const input = buildProblemInput(formData, skillId || null);
  if (!id || !input.text || !input.correctAnswer || !input.explanation) {
    redirect(`/teacher/content/skill/${skillId}/problem/${id}?error=1`);
  }

  await updateProblem(id, input);
  revalidatePath(`/teacher/content/skill/${skillId}`);
  redirect(`/teacher/content/skill/${skillId}`);
}

export async function deleteProblemAction(formData: FormData) {
  await requireTeacher();
  const id = String(formData.get("id") || "");
  const skillId = String(formData.get("skillId") || "");

  const ok = await deleteProblemSafely(id);
  revalidatePath(`/teacher/content/skill/${skillId}`);
  if (!ok) {
    redirect(`/teacher/content/skill/${skillId}?deleteError=1`);
  }
  redirect(`/teacher/content/skill/${skillId}`);
}
