/**
 * «Пришёл из мобильного приложения». Приложение открывает сайт через
 * /auth/app (lib/mobile/web-link.ts) — например, «Настройки профиля». По
 * правилам Google Play из Android-приложения нельзя вести к оплате цифровых
 * товаров, поэтому на время такого визита сайт прячет ссылки на тариф и
 * кнопки оплаты.
 *
 * Метка — обычная (не httpOnly) cookie на несколько часов: её читает и
 * сервер (страница тарифа), и встроенный скрипт в app/layout.tsx, который
 * ставит <html data-from-app> — по нему CSS прячет все ссылки на оплату.
 * Короткий срок — потому что Custom Tab на Android делит cookie с Chrome:
 * вечная метка спрятала бы оплату и при обычном заходе на сайт.
 */
export const FROM_APP_COOKIE = "pm_app";
export const FROM_APP_MAX_AGE = 6 * 60 * 60;

export function isFromAppCookie(value: string | undefined | null): boolean {
  return value === "1";
}
