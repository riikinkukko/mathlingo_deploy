import { NextResponse } from "next/server";
import { getCurriculum } from "@/lib/queries";

// Явно запрещаем статическую предгенерацию — иначе Next.js на билде
// пытается выполнить этот запрос к базе ВО ВРЕМЯ сборки (а не при реальном
// запросе пользователя), что на Vercel ломает деплой: во время build нет
// смысла и права ходить в продакшен-базу. Роут должен выполняться заново
// при каждом обращении.
export const dynamic = "force-dynamic";

export async function GET() {
  const curriculum = await getCurriculum();
  return NextResponse.json({ curriculum });
}
