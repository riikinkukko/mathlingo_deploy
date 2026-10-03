import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Снимок черновика к вопросу «Не понял»: видят только автор вопроса и его репетитор. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Требуется вход", { status: 401 });
  const [q] = await db
    .select({ studentId: schema.studentQuestions.studentId, teacherId: schema.studentQuestions.teacherId, sketch: schema.studentQuestions.sketch })
    .from(schema.studentQuestions)
    .where(eq(schema.studentQuestions.id, params.id))
    .limit(1);
  if (!q || !q.sketch || (q.studentId !== user.id && q.teacherId !== user.id)) return new NextResponse("Не найдено", { status: 404 });
  const m = /^data:(image\/(?:jpeg|png));base64,(.+)$/.exec(q.sketch);
  if (!m) return new NextResponse("Не найдено", { status: 404 });
  return new NextResponse(Buffer.from(m[2], "base64"), {
    headers: { "Content-Type": m[1], "Cache-Control": "private, max-age=86400" },
  });
}
