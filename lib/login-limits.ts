// Пороги защиты от перебора паролей (окно — 15 минут, считаем только
// НЕУДАЧНЫЕ входы). Чистая логика без БД — счётчики достаёт lib/queries.ts.
//
// Почему так:
//  • Жёсткая блокировка — по паре «email + IP». Перебирать пароль к аккаунту
//    с одного адреса быстро нельзя, а владелец с СВОЕГО адреса при этом входит:
//    чужие ошибки на его email его не блокируют.
//  • Общий потолок на email (с любых IP) оставлен против распределённого
//    перебора, но сделан очень высоким (500 за 15 минут). Раньше он был 50 —
//    злоумышленник мог намеренно набить 50 ошибок и на 15 минут закрыть вход
//    владельцу аккаунта отовсюду (DoS). 500 ошибок с разных адресов — это уже
//    явная атака ботнетом; против подбора пароля bcrypt + 8 попыток с адреса
//    и так дают мало шансов, а владелец всегда может сбросить пароль по почте.
//  • Потолок на IP — против перебора многих аккаунтов с одного адреса.
export const LOGIN_WINDOW_MIN = 15;
export const LOGIN_FAILS_PER_EMAIL_IP = 8;
export const LOGIN_FAILS_PER_EMAIL = 500;
export const LOGIN_FAILS_PER_IP = 30;

/** Ключи счётчиков в таблице login_failures для одной неудачной попытки. */
export function loginFailureKeys(ip: string, email: string): string[] {
  const keys: string[] = [];
  if (email) keys.push(`email:${email}`);
  if (email && ip) keys.push(`emailip:${email}|${ip}`);
  if (ip) keys.push(`ip:${ip}`);
  return keys;
}

export interface LoginFailCounts {
  emailIp: number;
  email: number;
  ip: number;
}

/** Причина блокировки входа или null, если вход разрешён. */
export function loginBlockReason(c: LoginFailCounts): "email_ip" | "email" | "ip" | null {
  if (c.emailIp >= LOGIN_FAILS_PER_EMAIL_IP) return "email_ip";
  if (c.email >= LOGIN_FAILS_PER_EMAIL) return "email";
  if (c.ip >= LOGIN_FAILS_PER_IP) return "ip";
  return null;
}
