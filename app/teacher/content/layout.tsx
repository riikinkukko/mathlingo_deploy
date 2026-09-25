import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

/**
 * Весь раздел /teacher/content — редактор ОБЩЕГО курса. Доступен только
 * владельцу платформы и админам (та же проверка стоит в каждом экшене
 * app/actions-content.ts — layout закрывает страницы, экшены закрывают
 * прямые запросы).
 */
export default async function ContentLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user || user.role !== "TEACHER") redirect("/login");
  if (!user.isPlatformOwner && !user.isAdmin) redirect("/teacher");
  return <>{children}</>;
}
