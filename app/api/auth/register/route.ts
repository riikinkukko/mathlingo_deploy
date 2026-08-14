import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { createSessionToken, hashPassword } from "@/lib/auth";
import { getUserByEmail, genId } from "@/lib/queries";
import { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { name?: string; email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректное тело запроса (ожидается JSON)" }, { status: 400 });
  }

  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!name || !email || password.length < 6) {
    return NextResponse.json(
      { error: "Заполните имя, email и пароль (минимум 6 символов)" },
      { status: 400 }
    );
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    return NextResponse.json({ error: "Пользователь с таким email уже существует" }, { status: 409 });
  }

  const userId = genId("u");
  await db.insert(schema.users).values({
    id: userId,
    name,
    email,
    passwordHash: await hashPassword(password),
    role: "STUDENT" as Role,
    plan: "free",
    energy: 5,
    energyUpdatedAt: new Date(),
  });

  const token = await createSessionToken(userId, "STUDENT");
  return NextResponse.json({
    token,
    user: { id: userId, name, email, role: "STUDENT", plan: "free", energy: 5 },
  });
}
