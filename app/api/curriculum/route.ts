import { NextResponse } from "next/server";
import { getCurriculum } from "@/lib/queries";
import { getSessionUser } from "@/lib/auth";
import { getBearerUser } from "@/lib/api-auth";

// Явно запрещаем статическую предгенерацию — иначе Next.js на билде
// пытается выполнить этот запрос к базе ВО ВРЕМЯ сборки (а не при реальном
// запросе пользователя), что на Vercel ломает деплой: во время build нет
// смысла и права ходить в продакшен-базу. Роут должен выполняться заново
// при каждом обращении.
export const dynamic = "force-dynamic";

/** Только для вошедших пользователей (cookie сайта или Bearer-токен). Раньше
 * отдавал всю программу с платной теорией любому без входа. */
export async function GET(req: Request) {
  const user = (await getSessionUser()) ?? (await getBearerUser(req));
  if (!user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  const curriculum = await getCurriculum();
  return NextResponse.json({ curriculum });
}
