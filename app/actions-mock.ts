"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { isMockMode } from "@/lib/mock-exam";
import {
  abandonMock,
  finishMock,
  saveMockPhoto,
  saveMockProgress,
  setMockSelfScore,
  startMock,
  type MockProgressPatch,
} from "@/lib/mock-queries";

// Пробник ЕГЭ — экшены ученика. Вся логика в lib/mock-queries.ts.

async function student() {
  const user = await getSessionUser();
  if (!user || user.role !== "STUDENT") return null;
  return user;
}

export type StartMockState = { error?: string } | null;

export async function startMockAction(_prev: StartMockState, formData: FormData): Promise<StartMockState> {
  const user = await student();
  if (!user) redirect("/login");
  const variant = Number(formData.get("variant"));
  const mode = formData.get("mode");
  if (!isMockMode(mode)) return { error: "Выбери режим" };
  const res = await startMock(user, variant, mode);
  if ("activeId" in res) redirect(`/student/mock/${res.activeId}?resume=1`);
  if ("error" in res) return { error: res.error };
  revalidatePath("/student/mock");
  redirect(`/student/mock/${res.id}`);
}

export async function saveMockProgressAction(id: string, patch: MockProgressPatch) {
  const user = await student();
  if (!user) return { error: "Войди заново" };
  return saveMockProgress(user, id, patch);
}

export async function saveMockPhotoAction(id: string, problemId: string, image: string | null) {
  const user = await student();
  if (!user) return { error: "Войди заново" };
  return saveMockPhoto(user, id, problemId, image);
}

export async function finishMockAction(id: string, patch?: MockProgressPatch) {
  const user = await student();
  if (!user) return { error: "Войди заново" };
  // Последние ответы — вместе со сдачей, чтобы не потерять несохранённое.
  if (patch) await saveMockProgress(user, id, patch);
  const res = await finishMock(user, id);
  revalidatePath("/student/mock");
  return res;
}

export async function setMockSelfScoreAction(id: string, problemId: string, score: number | null) {
  const user = await student();
  if (!user) return { error: "Войди заново" };
  const res = await setMockSelfScore(user, id, problemId, score);
  revalidatePath(`/student/mock/${id}`);
  return res;
}

export async function abandonMockAction(formData: FormData) {
  const user = await student();
  if (!user) redirect("/login");
  await abandonMock(user, String(formData.get("id") ?? ""));
  revalidatePath("/student/mock");
  redirect("/student/mock");
}
