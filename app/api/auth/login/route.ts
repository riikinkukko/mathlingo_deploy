import { NextResponse } from "next/server";
import { createSessionToken, verifyPassword } from "@/lib/auth";
import { getUserByEmail } from "@/lib/queries";

export async function POST(req: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректное тело запроса (ожидается JSON)" }, { status: 400 });
  }

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!email || !password) {
    return NextResponse.json({ error: "Укажите email и пароль" }, { status: 400 });
  }

  const user = await getUserByEmail(email);
  if (!user) {
    return NextResponse.json({ error: "Пользователь с таким email не найден" }, { status: 401 });
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Неверный пароль" }, { status: 401 });
  }

  const token = await createSessionToken(user.id, user.role);
  const { passwordHash, ...safeUser } = user;
  return NextResponse.json({ token, user: safeUser });
}
