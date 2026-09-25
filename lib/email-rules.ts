import { sql, type SQL } from "drizzle-orm";

/**
 * Правила email при самостоятельной регистрации — часть анти-абуза.
 *
 * Проблема: один реальный ящик легко превращается в десятки "разных" адресов
 * (ivan+1@yandex.ru, ivan+2@yandex.ru, i.v.a.n@gmail.com — всё приходит в один
 * ящик), и каждый новый аккаунт даёт новую бесплатную энергию ученику или
 * 3 новых бесплатных места репетитору. Плюс одноразовые почты (temp-mail и
 * т.п.), где ящик создаётся за секунду.
 *
 * Решение — сравнивать адреса в "каноническом" виде и не пускать одноразовые
 * домены. Честный пользователь ничего не заметит.
 */

// Одноразовые почтовые домены — открытый список (MIT), ~120 тыс. доменов.
// Грузится один раз лениво и только на сервере.
let disposableSet: Set<string> | null = null;
function getDisposableSet(): Set<string> {
  if (!disposableSet) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const list: string[] = require("disposable-email-domains");
    disposableSet = new Set(list);
  }
  return disposableSet;
}

export function isValidEmailFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** true для одноразовых доменов, включая их поддомены (x.mailinator.com). */
export function isDisposableEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase().trim();
  if (!domain) return false;
  const set = getDisposableSet();
  const parts = domain.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    if (set.has(parts.slice(i).join("."))) return true;
  }
  return false;
}

const GMAIL_DOMAINS = ["gmail.com", "googlemail.com"];
const YANDEX_DOMAINS = ["yandex.ru", "ya.ru", "yandex.com", "yandex.by", "yandex.kz", "yandex.ua"];

/**
 * SQL-выражение: канонический вид email.
 * - всё в нижнем регистре, часть после "+" в имени отбрасывается
 *   (ivan+1@mail.ru → ivan@mail.ru);
 * - Gmail: точки в имени не значат ничего (i.van@gmail.com = ivan@gmail.com),
 *   googlemail.com = gmail.com;
 * - Яндекс: все его домены — один ящик, а точка и дефис в имени
 *   взаимозаменяемы (ivan.petrov@ya.ru = ivan-petrov@yandex.ru).
 *
 * Реализовано в SQL, а не в TypeScript, чтобы сравнивать с УЖЕ существующими
 * аккаунтами без миграции и отдельной колонки: обе стороны сравнения
 * проходят через одно и то же выражение.
 */
export function canonicalEmailSql(x: SQL): SQL {
  const lowered = sql`lower(trim(${x}))`;
  const local = sql`regexp_replace(split_part(${lowered}, '@', 1), '\\+.*$', '')`;
  const domain = sql`split_part(${lowered}, '@', 2)`;
  const gmail = sql.raw(GMAIL_DOMAINS.map((d) => `'${d}'`).join(","));
  const yandex = sql.raw(YANDEX_DOMAINS.map((d) => `'${d}'`).join(","));
  return sql`(CASE
    WHEN ${domain} IN (${gmail}) THEN replace(${local}, '.', '') || '@gmail.com'
    WHEN ${domain} IN (${yandex}) THEN replace(${local}, '.', '-') || '@yandex.ru'
    ELSE ${local} || '@' || ${domain}
  END)`;
}
