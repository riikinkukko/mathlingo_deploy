import { createHmac } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getUserById } from "./queries";
import { Role, User } from "./types";
import { getSessionSecret } from "./session-secret";

const COOKIE_NAME = "mathapp_session";

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function passwordCredentialVersion(passwordHash: string): string {
  return createHmac("sha256", getSessionSecret()).update("password-version:").update(passwordHash).digest("base64url");
}

export async function createSessionToken(
  userId: string, role: Role, authenticatedAt = Date.now(), credentialVersion?: string,
) {
  const version = credentialVersion ?? passwordCredentialVersion((await getUserById(userId))?.passwordHash ?? "");
  return new SignJWT({ userId, role, authenticatedAt, credentialVersion: version })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSessionSecret());
}

export async function verifySessionToken(
  token: string
): Promise<{ userId: string; role: Role; issuedAt?: number; authenticatedAt?: number; credentialVersion?: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSessionSecret());
    return {
      userId: payload.userId as string,
      role: payload.role as Role,
      issuedAt: payload.iat,
      credentialVersion: typeof payload.credentialVersion === "string" ? payload.credentialVersion : undefined,
      authenticatedAt: typeof payload.authenticatedAt === "number" ? payload.authenticatedAt : undefined,
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string) {
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie() {
  (await cookies()).set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
}

/**
 * «Действовать от имени пользователя», вошедшего в приложение по токену.
 * Мост /api/m/teacher/action вызывает те же server actions, что и сайт: они
 * берут пользователя через getSessionUser(), а здесь он подставляется вместо
 * cookie. Права и проверки остаются общими для сайта и приложения.
 * Хранится только id — пользователь каждый раз перечитывается из базы.
 */
const actor = new AsyncLocalStorage<{ userId: string }>();

export function runAsUser<T>(user: Pick<User, "id">, fn: () => Promise<T>): Promise<T> {
  return actor.run({ userId: user.id }, fn);
}

export async function getSessionUser(): Promise<User | null> {
  const forced = actor.getStore();
  if (forced) return (await getUserById(forced.userId)) ?? null;
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session) return null;
  const user = await getUserById(session.userId);
  // Подпись верна, но аккаунта уже нет или пароль с тех пор меняли — такая
  // сессия недействительна. Отправляем на вход, а не возвращаем null: страницы
  // кабинетов рассчитывают, что пользователь есть (middleware уже проверил
  // подпись), и с null падали бы с ошибкой вместо понятного экрана входа.
  if (!user || isSessionRevoked(user, session.issuedAt, session.authenticatedAt, session.credentialVersion)) redirect("/login");
  return user;
}

/**
 * Как getSessionUser, но без перехода на /login — для API-адресов: там нужен
 * ответ 401 (или попытка входа по токену приложения), а не редирект.
 */
export async function getSessionUserOrNull(): Promise<User | null> {
  const forced = actor.getStore();
  if (forced) return (await getUserById(forced.userId)) ?? null;
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session) return null;
  const user = await getUserById(session.userId);
  if (!user || isSessionRevoked(user, session.issuedAt, session.authenticatedAt, session.credentialVersion)) return null;
  return user;
}

/** Сессия выдана до последней смены/сброса пароля или до «Выйти на всех
 * устройствах» — недействительна. Так сброс пароля выкидывает все ранее
 * открытые сессии (в т.ч. у того, кто, возможно, узнал старый пароль), а
 * кнопка в профиле — все сессии на других устройствах. Старые токены с iat
 * в ту же секунду отзываются: их нельзя отличить от выданных до смены пароля. */
export function isSessionRevoked(
  user: Pick<User, "passwordChangedAt" | "sessionsRevokedAt"> & Partial<Pick<User, "passwordHash">>,
  issuedAtSec?: number,
  authenticatedAt?: number,
  credentialVersion?: string
): boolean {
  if (user.passwordHash) {
    if (credentialVersion && credentialVersion !== passwordCredentialVersion(user.passwordHash)) return true;
    if (!credentialVersion && user.passwordChangedAt) return true;
  }
  const marks = [credentialVersion ? undefined : user.passwordChangedAt, user.sessionsRevokedAt]
    .filter((d): d is string => !!d)
    .map((d) => new Date(d).getTime());
  if (marks.length === 0) return false;
  if (authenticatedAt !== undefined) return authenticatedAt < Math.max(...marks);
  if (!issuedAtSec) return true;
  return issuedAtSec <= Math.floor(Math.max(...marks) / 1000);
}

/** Единая точка проверки доступа к /admin/*. isAdmin не закодирован в JWT
 * сессии (там только userId+role) — middleware.ts работает на Edge-рантайме
 * без доступа к Postgres через 'pg', поэтому проверка идёт здесь, на уровне
 * страницы (Server Component уже выполняется в Node.js-рантайме, БД доступна). */
export async function requireAdmin(): Promise<User> {
  const user = await getSessionUser();
  if (!user || !user.isAdmin) {
    redirect("/login");
  }
  return user!;
}

export { COOKIE_NAME };
