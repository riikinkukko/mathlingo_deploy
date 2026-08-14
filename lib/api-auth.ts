import { verifySessionToken } from "./auth";
import { getUserById } from "./queries";
import { User } from "./types";

/**
 * Достаёт пользователя из заголовка Authorization: Bearer <token> —
 * альтернатива httpOnly cookie для клиентов без общего с сайтом браузера
 * (мобильное приложение на React Native/Capacitor). Токен — тот же JWT,
 * что и в cookie-сессии (см. lib/auth.ts createSessionToken), просто
 * доставляется иначе. Веб продолжает использовать cookie как раньше —
 * это ДОПОЛНИТЕЛЬНЫЙ путь входа, не замена.
 */
export async function getBearerUser(req: Request): Promise<User | null> {
  const header = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session) return null;
  return (await getUserById(session.userId)) ?? null;
}
