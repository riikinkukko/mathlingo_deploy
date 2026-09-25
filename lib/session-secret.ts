/**
 * Секрет подписи сессий (JWT). Используется и в lib/auth.ts, и в
 * middleware.ts (Edge-рантайм), поэтому здесь нет импортов Node.js.
 *
 * Раньше при отсутствии SESSION_SECRET код молча подставлял строку по
 * умолчанию — а она опубликована в открытом репозитории. С ней любой мог бы
 * подписать себе сессию от имени любого пользователя. Теперь в продакшене без
 * нормального секрета (32+ символа) сервер отказывается выдавать и проверять
 * сессии — лучше явная ошибка, чем тихая дыра. Секрет читается лениво, в
 * момент использования, чтобы не ломать сборку (next build).
 */
const DEV_FALLBACK = "dev-secret-change-me-please-32chars";

export function getSessionSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET?.trim();
  if (secret && secret.length >= 32 && secret !== DEV_FALLBACK) {
    return new TextEncoder().encode(secret);
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET не задан (или короче 32 символов) в .env.local. Сгенерируйте: openssl rand -hex 32"
    );
  }
  return new TextEncoder().encode(DEV_FALLBACK);
}
