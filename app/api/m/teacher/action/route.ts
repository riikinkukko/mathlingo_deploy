import { runAsUser } from "@/lib/auth";
import { fail, json, readJson, requireUser } from "@/lib/mobile/api";
import { runTeacherAction } from "@/lib/mobile/teacher-actions";

export const dynamic = "force-dynamic";

/**
 * Действие репетитора из приложения: { name, fields }. Выполняется тем же
 * server action, что и на сайте, от имени владельца токена
 * (lib/mobile/teacher-actions.ts). Пометки на фото проверки — до 1 МБ.
 */
export async function POST(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  if (user.role !== "TEACHER") return fail("Только для репетитора", 403);
  const body = await readJson<{ name?: unknown; fields?: unknown }>(req, 1_200_000);
  if (!body || typeof body.name !== "string") return fail("Некорректный запрос");
  const fields = body.fields && typeof body.fields === "object" ? (body.fields as Record<string, unknown>) : {};
  const out = await runAsUser(user, () => runTeacherAction(body.name as string, fields));
  return out.ok ? json(out) : fail(out.error, 400);
}
