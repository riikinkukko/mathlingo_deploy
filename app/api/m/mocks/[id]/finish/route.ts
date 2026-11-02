import { finishMock, saveMockProgress } from "@/lib/mock-queries";
import { fail, json, readJson, requireStudent } from "@/lib/mobile/api";

export const dynamic = "force-dynamic";

/** Сдать работу. Последние ответы можно прислать вместе со сдачей. */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const user = await requireStudent(req);
  if (user instanceof Response) return user;
  const id = (await props.params).id;
  const body = await readJson(req, 200_000);
  if (body && Object.keys(body).length) await saveMockProgress(user, id, body);
  const res = await finishMock(user, id);
  return "error" in res ? fail(res.error) : json(res);
}
