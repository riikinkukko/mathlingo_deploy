import { isMockMode } from "@/lib/mock-exam";
import { startMock } from "@/lib/mock-queries";
import { fail, json, readJson, requireStudent } from "@/lib/mobile/api";
import { mockListPayload } from "@/lib/mobile/mock-payload";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await requireStudent(req);
  if (user instanceof Response) return user;
  return json(await mockListPayload(user));
}

/** Начать вариант: { variant, mode }. Если уже идёт другой пробник — вернёт его id. */
export async function POST(req: Request) {
  const user = await requireStudent(req);
  if (user instanceof Response) return user;
  const body = await readJson<{ variant?: unknown; mode?: unknown }>(req, 2_000);
  if (!body || !isMockMode(body.mode)) return fail("Выбери режим");
  const res = await startMock(user, Number(body.variant), body.mode);
  if ("activeId" in res) return json({ id: res.activeId, resumed: true });
  if ("error" in res) return fail(res.error);
  return json({ id: res.id, resumed: false });
}
