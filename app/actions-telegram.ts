"use server";

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { unlinkTelegramAccount } from "@/lib/queries";

// connectTelegramAction (генерация кода + redirect() на t.me из server
// action) убран отсюда — см. комментарий в app/student/profile/page.tsx:
// ссылка на бота теперь строится прямо на сервере при рендере страницы и
// рендерится обычным <a href>, без redirect() на внешний домен из
// server action.

export async function disconnectTelegramAction() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  await unlinkTelegramAccount(user!.id);
  redirect("/student/profile?telegram=disconnected");
}
