import { setMockSelfScore } from "@/lib/mock-queries";
import { fail, json, readJson, requireStudent } from "@/lib/mobile/api";

export const dynamic = "force-dynamic";

/** Самопроверка задания второй части по критериям ФИПИ: { problemId, score }. */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const user = await requireStudent(req);
  if (user instanceof Response) return user;
  const body = await readJson<{ problemId?: unknown; score?: unknown }>(req, 2_000);
  if (!body || typeof body.problemId !== "string") return fail("Некорректный запрос");
  const score = body.score === null ? null : Number(body.score);
  const res = await setMockSelfScore(user, (await props.params).id, body.problemId, score);
  return "error" in res ? fail(res.error) : json(res);
}
