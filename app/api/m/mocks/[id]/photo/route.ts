import { saveMockPhoto } from "@/lib/mock-queries";
import { fail, json, readJson, requireStudent } from "@/lib/mobile/api";

export const dynamic = "force-dynamic";

/** Фото решения задания второй части: { problemId, image } (image: null — убрать). */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const user = await requireStudent(req);
  if (user instanceof Response) return user;
  const body = await readJson<{ problemId?: unknown; image?: unknown }>(req, 1_000_000);
  if (!body || typeof body.problemId !== "string") return fail("Некорректный запрос");
  const image = typeof body.image === "string" ? body.image : null;
  const res = await saveMockPhoto(user, (await props.params).id, body.problemId, image);
  return "error" in res ? fail(res.error) : json(res);
}
