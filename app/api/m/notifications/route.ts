import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { getNotificationsForUser, getUnreadNotificationCount } from "@/lib/queries";
import { json, readJson, requireUser } from "@/lib/mobile/api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const [notifications, unread] = await Promise.all([
    getNotificationsForUser(user.id, 50),
    getUnreadNotificationCount(user.id),
  ]);
  return json({ notifications, unread });
}

/** Отметить прочитанным: { id } — одно уведомление, без id — все. */
export async function POST(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const body = await readJson<{ id?: unknown }>(req, 2_000);
  const where =
    typeof body?.id === "string"
      ? and(eq(schema.notifications.id, body.id), eq(schema.notifications.userId, user.id))
      : eq(schema.notifications.userId, user.id);
  await db.update(schema.notifications).set({ read: true }).where(where);
  return json({ ok: true });
}
