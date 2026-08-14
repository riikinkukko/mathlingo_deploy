import { NextResponse } from "next/server";
import { getBearerUser } from "@/lib/api-auth";
import { performSubmitAttempt } from "@/lib/actions-core";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getBearerUser(req);
  if (!user || user.role !== "STUDENT") {
    return NextResponse.json({ error: "Требуется авторизация ученика (Bearer-токен)" }, { status: 401 });
  }

  let body: { problemId?: string; answer?: string; source?: "lesson" | "assignment" | "review" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректное тело запроса (ожидается JSON)" }, { status: 400 });
  }

  const { problemId, answer, source } = body;
  if (!problemId || !answer || (source !== "lesson" && source !== "assignment" && source !== "review")) {
    return NextResponse.json(
      { error: "Обязательные поля: problemId, answer, source ('lesson' | 'assignment' | 'review')" },
      { status: 400 }
    );
  }

  const result = await performSubmitAttempt(user, problemId, answer, source);
  if ("error" in result) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
