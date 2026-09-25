import { randomBytes, randomInt } from "crypto";

/** Криптостойкий случайный токен (для ссылок подтверждения email, сброса
 * пароля, привязки Telegram). Math.random для этого не годится — его
 * последовательность предсказуема. */
export function secureToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Короткий код без спецсимволов — Telegram принимает в ?start= только [A-Za-z0-9_-]. */
export function secureCode(length = 16): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}

/** Пароль по умолчанию для аккаунтов, которые создаёт репетитор (ученик,
 * родитель), если поле пароля оставили пустым. Раньше это был общий
 * "demo1234" — одинаковый у всех и опубликованный в открытом репозитории. */
export function generatePassword(): string {
  return secureCode(10);
}
