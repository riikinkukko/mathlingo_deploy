import { createWebLink, safeNext } from "@/lib/mobile/web-link";
import { json, readJson, requireUser } from "@/lib/mobile/api";

export const dynamic = "force-dynamic";

/**
 * Одноразовая ссылка «открыть на сайте уже вошедшим»: для разделов, которых
 * нет в приложении (кабинет репетитора и родителя, тариф, настройки).
 */
export async function POST(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const body = await readJson<{ next?: unknown }>(req, 2_000);
  const next = safeNext(body?.next ?? `/${user.role.toLowerCase()}`);
  const t = await createWebLink(user.id, next);
  const base = (process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  return json({ url: `${base}/auth/app?t=${encodeURIComponent(t)}` });
}
