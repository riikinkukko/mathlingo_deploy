"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { unlinkTelegramAccount } from "@/lib/queries";

// connectTelegramAction (генерация кода + redirect() на t.me из server
// action) убран отсюда — см. комментарий в app/student/profile/page.tsx:
// ссылка на бота теперь строится прямо на сервере при рендере страницы и
// рендерится обычным <a href>, без redirect() на внешний домен из
// server action.

const DEFAULT_BACK: Record<string, string> = {
  STUDENT: "/student/profile",
  TEACHER: "/teacher/settings",
  PARENT: "/parent",
};

export async function disconnectTelegramAction(formData?: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  await unlinkTelegramAccount(user!.id);
  // Куда вернуться — только внутренний путь (не открытый редирект).
  const raw = String(formData?.get("returnTo") || "");
  const back = raw.startsWith("/") && !raw.startsWith("//") ? raw : DEFAULT_BACK[user!.role] ?? "/";
  redirect(`${back}${back.includes("?") ? "&" : "?"}telegram=disconnected`);
}

export type TgPrefsState = { ok?: boolean; at?: number; error?: string } | null;

/** «Настройки» репетитора: что присылать в Telegram. */
export async function saveTeacherTelegramPrefsAction(_prev: TgPrefsState, formData: FormData): Promise<TgPrefsState> {
  const user = await getSessionUser();
  if (!user || user.role !== "TEACHER") return { error: "Нет доступа" };
  await db
    .update(schema.users)
    .set({
      tgNotifyHomework: formData.get("homework") === "on",
      tgNotifyLessons: formData.get("lessons") === "on",
      tgDailyDigest: formData.get("digest") === "on",
    })
    .where(eq(schema.users.id, user.id));
  revalidatePath("/teacher/settings");
  return { ok: true, at: Date.now() };
}

/** Родитель: присылать ли недельный отчёт по воскресеньям. */
export async function setParentWeeklyReportAction(_prev: TgPrefsState, formData: FormData): Promise<TgPrefsState> {
  const user = await getSessionUser();
  if (!user || user.role !== "PARENT") return { error: "Нет доступа" };
  await db
    .update(schema.users)
    .set({ tgWeeklyReport: formData.get("weekly") === "on" })
    .where(eq(schema.users.id, user.id));
  return { ok: true, at: Date.now() };
}
