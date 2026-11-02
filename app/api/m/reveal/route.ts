import { performRevealSolution } from "@/lib/actions-core";
import { fail, json, readJson, requireStudent } from "@/lib/mobile/api";

export const dynamic = "force-dynamic";

/** Показать ответ и разбор — после трёх неверных попыток или если задача решена. */
export async function POST(req: Request) {
  const user = await requireStudent(req);
  if (user instanceof Response) return user;
  const body = await readJson<{ problemId?: unknown }>(req, 2_000);
  const res = await performRevealSolution(user, String(body?.problemId ?? ""));
  if ("error" in res) return fail(res.error);
  return json(res);
}
