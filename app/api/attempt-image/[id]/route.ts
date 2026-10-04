import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { getPaidOrderForAttempt, isReviewer } from "@/lib/paid-review";

export const dynamic = "force-dynamic";

/** Фото решения к попытке: видят только сам ученик и его репетитор.
 * ?v=markup — то же фото с пометками репетитора. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const markup = new URL(req.url).searchParams.get("v") === "markup";
  const user = await getSessionUser();
  if (!user) return new NextResponse("Требуется вход", { status: 401 });
  const [row] = await db
    .select({ data: schema.attemptImages.data, annotated: schema.attemptImages.annotated, studentId: schema.attempts.studentId, teacherId: schema.users.teacherId })
    .from(schema.attemptImages)
    .innerJoin(schema.attempts, eq(schema.attempts.id, schema.attemptImages.attemptId))
    .innerJoin(schema.users, eq(schema.users.id, schema.attempts.studentId))
    .where(eq(schema.attemptImages.attemptId, params.id))
    .limit(1);
  // Эксперт платформы видит фото только у оплаченных платных проверок.
  const allowed =
    !!row && (row.studentId === user.id || row.teacherId === user.id || (isReviewer(user) && !!(await getPaidOrderForAttempt(params.id))));
  if (!row || !allowed) return new NextResponse("Не найдено", { status: 404 });
  const src = markup ? row.annotated : row.data;
  const m = src ? /^data:(image\/(?:jpeg|png));base64,(.+)$/.exec(src) : null;
  if (!m) return new NextResponse("Не найдено", { status: 404 });
  return new NextResponse(Buffer.from(m[2], "base64"), {
    // Разметку репетитор может переделать при повторной проверке — не кэшируем надолго.
    headers: { "Content-Type": m[1], "Cache-Control": markup ? "private, no-cache" : "private, max-age=86400" },
  });
}
