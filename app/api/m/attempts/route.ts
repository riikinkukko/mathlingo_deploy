import { performSubmitAttempt } from "@/lib/actions-core";
import { fail, json, readJson, requireStudent } from "@/lib/mobile/api";

export const dynamic = "force-dynamic";

/** Ответ на задачу (урок, повторение, домашка). К развёрнутому решению — фото (data URL). */
export async function POST(req: Request) {
  const user = await requireStudent(req);
  if (user instanceof Response) return user;
  // Фото решения сжимается в приложении до ~650 КБ.
  const body = await readJson<{ problemId?: unknown; answer?: unknown; source?: unknown; image?: unknown; answeredAt?: unknown }>(
    req,
    1_000_000
  );
  if (!body) return fail("Некорректный запрос");
  const { problemId, answer, source, image } = body;
  if (typeof problemId !== "string" || typeof answer !== "string") return fail("Введите ответ");
  if (source !== "lesson" && source !== "assignment" && source !== "review") return fail("Некорректный источник");
  // answeredAt — когда ответ решён без сети (очередь приложения); сервер сам
  // решает, принять ли это время (offlineAnswerTime).
  const answeredAt = typeof body.answeredAt === "number" ? new Date(body.answeredAt) : undefined;
  const result = await performSubmitAttempt(user, problemId, answer, source, typeof image === "string" ? image : null, {
    answeredAt,
  });
  if ("error" in result) return fail(String(result.error));
  return json(result);
}
