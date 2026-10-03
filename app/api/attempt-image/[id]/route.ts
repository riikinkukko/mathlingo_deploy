import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Фото решения к попытке: видят только сам ученик и его репетитор. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Требуется вход", { status: 401 });
  const [row] = await db
    .select({ data: schema.attemptImages.data, studentId: schema.attempts.studentId, teacherId: schema.users.teacherId })
    .from(schema.attemptImages)
    .innerJoin(schema.attempts, eq(schema.attempts.id, schema.attemptImages.attemptId))
    .innerJoin(schema.users, eq(schema.users.id, schema.attempts.studentId))
    .where(eq(schema.attemptImages.attemptId, params.id))
    .limit(1);
  if (!row || (row.studentId !== user.id && row.teacherId !== user.id)) return new NextResponse("Не найдено", { status: 404 });
  const m = /^data:(image\/(?:jpeg|png));base64,(.+)$/.exec(row.data);
  if (!m) return new NextResponse("Не найдено", { status: 404 });
  return new NextResponse(Buffer.from(m[2], "base64"), {
    headers: { "Content-Type": m[1], "Cache-Control": "private, max-age=86400" },
  });
}
