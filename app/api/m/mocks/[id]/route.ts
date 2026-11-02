import { abandonMock, autoFinishIfExpired, getMockAttempt, saveMockProgress } from "@/lib/mock-queries";
import { fail, json, readJson, requireStudent } from "@/lib/mobile/api";
import { mockResultPayload, mockRunnerPayload } from "@/lib/mobile/mock-payload";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Неоконченный пробник — данные для решения, сданный — разбор. */
export async function GET(req: Request, props: Ctx) {
  const user = await requireStudent(req);
  if (user instanceof Response) return user;
  const raw = await getMockAttempt((await props.params).id, user.id);
  if (!raw) return fail("Пробник не найден", 404);
  const m = await autoFinishIfExpired(user, raw);
  return json(m.finishedAt ? await mockResultPayload(m, user) : await mockRunnerPayload(m, user));
}

/** Автосохранение: { answers, flags, timeSpent }. */
export async function PATCH(req: Request, props: Ctx) {
  const user = await requireStudent(req);
  if (user instanceof Response) return user;
  const body = await readJson(req, 200_000);
  if (!body) return fail("Некорректный запрос");
  const res = await saveMockProgress(user, (await props.params).id, body);
  return "error" in res ? fail(res.error) : json(res);
}

/** Бросить неоконченный пробник. */
export async function DELETE(req: Request, props: Ctx) {
  const user = await requireStudent(req);
  if (user instanceof Response) return user;
  await abandonMock(user, (await props.params).id);
  return json({ ok: true });
}
