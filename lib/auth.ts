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

export async function createSessionToken(userId: string, role: Role) {
  return new SignJWT({ userId, role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSessionSecret());
}

export async function verifySessionToken(
  token: string
): Promise<{ userId: string; role: Role; issuedAt?: number } | null> {
  try {
    const { payload } = await jwtVerify(token, getSessionSecret());
    return { userId: payload.userId as string, role: payload.role as Role, issuedAt: payload.iat };
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string) {
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearSessionCookie() {
  cookies().set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
}

export async function getSessionUser(): Promise<User | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session) return null;
  const user = await getUserById(session.userId);
  // Подпись верна, но аккаунта уже нет или пароль с тех пор меняли — такая
  // сессия недействительна. Отправляем на вход, а не возвращаем null: страницы
  // кабинетов рассчитывают, что пользователь есть (middleware уже проверил
  // подпись), и с null падали бы с ошибкой вместо понятного экрана входа.
  if (!user || isSessionRevoked(user, session.issuedAt)) redirect("/login");
  return user;
}

/** Сессия выдана до последней смены/сброса пароля — недействительна. Так сброс
 * пароля выкидывает все ранее открытые сессии (в т.ч. у того, кто, возможно,
 * узнал старый пароль). Секундная точность у iat — с запасом в 1 с. */
export function isSessionRevoked(user: User, issuedAtSec?: number): boolean {
  if (!user.passwordChangedAt) return false;
  if (!issuedAtSec) return true;
  return (issuedAtSec + 1) * 1000 <= new Date(user.passwordChangedAt).getTime();
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
