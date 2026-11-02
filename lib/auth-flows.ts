/**
 * Вход и регистрация ученика — общая логика для формы сайта (app/actions.ts)
 * и мобильного приложения (app/api/m/auth/*). Все защиты живут здесь в одном
 * экземпляре: лимит попыток входа по (email, IP), лимит регистраций с IP,
 * одноразовые почты, «один ящик — один аккаунт», согласие на обработку ПДн,
 * письмо подтверждения почты. Транспорт (cookie, редирект, JSON) — у
 * вызывающего.
 */
import { db } from "./db/client";
import * as schema from "./db/schema";
import { hashPassword, verifyPassword } from "./auth";
import {
  FREE_MAX_ENERGY,
  clearLoginFailures,
  createAuthToken,
  genId,
  getUserByEmail,
  isLoginRateLimited,
  isMailboxTakenBySelfRegisteredAccount,
  isRegistrationRateLimited,
  recordLoginFailure,
  recordRegistrationAttempt,
} from "./queries";
import { sendVerificationEmail } from "./email";
import { isDisposableEmail, isValidEmailFormat } from "./email-rules";
import type { Role, User } from "./types";

/** Реальный IP клиента из заголовков nginx. X-Real-IP подделать нельзя; из
 * X-Forwarded-For берём последний адрес (его добавил наш nginx). Пустая
 * строка в локальной разработке без nginx — лимиты её не режут. */
export function clientIpFromHeaders(h: Headers): string {
  const realIp = h.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = h.get("x-forwarded-for");
  return forwarded ? forwarded.split(",").pop()!.trim() : "";
}

export function normalizeEmail(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase().slice(0, 254);
}

export async function passwordLogin(
  emailRaw: unknown,
  passwordRaw: unknown,
  clientIp: string
): Promise<{ user: User } | { error: string }> {
  const email = normalizeEmail(emailRaw);
  const password = String(passwordRaw ?? "");
  if (await isLoginRateLimited(clientIp, email)) {
    return { error: "Слишком много неудачных попыток входа. Подождите 15 минут или восстановите пароль." };
  }
  // Одинаковое сообщение для «нет такого email» и «неверный пароль» — иначе
  // по ответу можно узнать, зарегистрирован ли человек на сайте.
  const user = await getUserByEmail(email);
  const ok = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !ok) {
    await recordLoginFailure(clientIp, email);
    return { error: "Неверный email или пароль" };
  }
  await clearLoginFailures(email);
  return { user };
}

export async function checkRegistrationEmail(email: string): Promise<string | null> {
  if (!isValidEmailFormat(email)) return "Проверьте адрес email — похоже, в нём опечатка";
  if (isDisposableEmail(email)) {
    return "Одноразовые почтовые адреса не подходят — укажите свою постоянную почту";
  }
  if (await getUserByEmail(email)) return "Пользователь с таким email уже существует";
  if (await isMailboxTakenBySelfRegisteredAccount(email)) {
    return "Аккаунт с этим почтовым ящиком уже есть. Войдите в него или восстановите пароль";
  }
  return null;
}

/**
 * Регистрация самостоятельного ученика (Free). Возвращает id нового
 * пользователя; промокод и сессию оформляет вызывающий.
 */
export async function registerStudent(
  input: { name: unknown; email: unknown; password: unknown; consent: boolean },
  clientIp: string
): Promise<{ userId: string } | { error: string }> {
  const name = String(input.name ?? "").trim().slice(0, 80);
  const email = normalizeEmail(input.email);
  const password = String(input.password ?? "");

  // Считаем ЛЮБУЮ попытку, не только успешную: иначе лимит Free-энергии
  // обходился бы регистрацией нового аккаунта, а бот перебирал бы адреса.
  if (await isRegistrationRateLimited(clientIp, "STUDENT")) {
    return { error: "Слишком много попыток регистрации с этого адреса. Попробуйте позже." };
  }
  if (!name || !email || password.length < 6) {
    await recordRegistrationAttempt(clientIp, "STUDENT");
    return { error: "Заполните имя, email и пароль (минимум 6 символов)" };
  }
  // Без согласия на обработку персональных данных регистрация не проходит
  // ни при каких условиях (152-ФЗ, см. app/legal/consent).
  if (!input.consent) {
    await recordRegistrationAttempt(clientIp, "STUDENT");
    return { error: "Нужно принять условия и дать согласие на обработку персональных данных" };
  }
  const emailError = await checkRegistrationEmail(email);
  await recordRegistrationAttempt(clientIp, "STUDENT");
  if (emailError) return { error: emailError };

  const userId = genId("u");
  await db.insert(schema.users).values({
    id: userId,
    name,
    email,
    passwordHash: await hashPassword(password),
    role: "STUDENT" as Role,
    consentGivenAt: new Date(),
    // teacherId не задаём — это самостоятельный пользователь.
    plan: "free",
    // Полный запас с первого дня; подзарядка — после подтверждения почты.
    energy: FREE_MAX_ENERGY,
    energyUpdatedAt: new Date(),
  });

  // Письмо не уйдёт — регистрацию не срываем: подтвердить можно позже из профиля.
  const verificationToken = await createAuthToken(userId, "email_verification", 24 * 3600 * 1000);
  await sendVerificationEmail(email, verificationToken).catch((e) =>
    console.error("Не удалось отправить письмо верификации:", e)
  );
  return { userId };
}
