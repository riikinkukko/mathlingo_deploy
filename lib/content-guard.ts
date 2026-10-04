import { redirect } from "next/navigation";
import { getSessionUser } from "./auth";

/** Редактор общего курса — только владелец платформы и админы. Вызывается в
 * КАЖДОЙ странице раздела: layout в App Router не защищает страницу при
 * клиентской навигации (RSC-запрос может прийти только за сегментом страницы). */
export async function requireContentEditor() {
  const user = await getSessionUser();
  if (!user || user.role !== "TEACHER") redirect("/login");
  if (!user.isPlatformOwner && !user.isAdmin) redirect("/teacher");
  return user;
}
