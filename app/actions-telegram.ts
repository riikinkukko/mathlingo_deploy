"use server";

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { generateTelegramLinkCode, unlinkTelegramAccount } from "@/lib/queries";
import { buildTelegramLinkUrl, isTelegramConfigured } from "@/lib/telegram";

export async function connectTelegramAction() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!isTelegramConfigured()) {
    redirect("/student/profile?error=telegram_not_configured");
  }

  const code = await generateTelegramLinkCode(user!.id);
  const url = buildTelegramLinkUrl(code);
  if (!url) {
    redirect("/student/profile?error=telegram_not_configured");
  }
  redirect(url);
}

export async function disconnectTelegramAction() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  await unlinkTelegramAccount(user!.id);
  redirect("/student/profile?telegram=disconnected");
}
