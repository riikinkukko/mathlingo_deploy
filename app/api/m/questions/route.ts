import { getQuestionsForStudent } from "@/lib/queries";
import { performAskTeacher } from "@/lib/questions-core";
import { fail, json, readJson, requireStudent } from "@/lib/mobile/api";

export const dynamic = "force-dynamic";

/** Мои вопросы репетитору и его ответы. */
export async function GET(req: Request) {
  const user = await requireStudent(req);
  if (user instanceof Response) return user;
  const list = await getQuestionsForStudent(user.id);
  return json({
    canAsk: !!user.teacherId,
    questions: list.map((q) => ({
      id: q.id,
      problemId: q.problemId,
      problemText: q.problemText,
      egeTaskNumber: q.egeTaskNumber,
      studentAnswer: q.studentAnswer,
      message: q.message,
      answer: q.answer,
      answeredAt: q.answeredAt,
      createdAt: q.createdAt,
      hasSketch: q.hasSketch,
    })),
  });
}

/** «Не понял — спросить репетитора»: { problemId, message, answer, sketch? (JPEG data URL черновика) }. */
export async function POST(req: Request) {
  const user = await requireStudent(req);
  if (user instanceof Response) return user;
  const body = await readJson<{ problemId?: unknown; message?: unknown; answer?: unknown; sketch?: unknown }>(req, 900_000);
  const res = await performAskTeacher(
    user,
    String(body?.problemId ?? ""),
    typeof body?.message === "string" ? body.message : "",
    typeof body?.answer === "string" ? body.answer : "",
    typeof body?.sketch === "string" ? body.sketch : null
  );
  if ("error" in res) return fail(res.error);
  return json({ ok: true });
}
