import { json, requireUser } from "@/lib/mobile/api";
import { sessionPayload } from "@/lib/mobile/session";

export const dynamic = "force-dynamic";

/** Профиль и свежий токен: сессия в приложении продлевается при каждом запуске. */
export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  return json(await sessionPayload(user));
}
