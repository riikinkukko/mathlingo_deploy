import { deletePushToken, isExpoPushToken, savePushToken } from "@/lib/push";
import { fail, json, readJson, requireUser } from "@/lib/mobile/api";

export const dynamic = "force-dynamic";

/** Привязать устройство к пользователю для push-уведомлений. */
export async function POST(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const body = await readJson<{ token?: unknown; platform?: unknown }>(req, 2_000);
  if (!isExpoPushToken(body?.token)) return fail("Некорректный токен");
  await savePushToken(user.id, body.token, String(body.platform ?? "android"));
  return json({ ok: true });
}

/** Отвязать устройство (выход из аккаунта). */
export async function DELETE(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const body = await readJson<{ token?: unknown }>(req, 2_000);
  if (isExpoPushToken(body?.token)) await deletePushToken(user.id, body.token);
  return json({ ok: true });
}
