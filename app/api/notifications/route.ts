import { NextResponse } from "next/server";
import { getBearerUser } from "@/lib/api-auth";
import { getNotificationsForUser, getUnreadNotificationCount } from "@/lib/queries";

export async function GET(req: Request) {
  const user = await getBearerUser(req);
  if (!user) {
    return NextResponse.json({ error: "Требуется авторизация (Bearer-токен)" }, { status: 401 });
  }
  const notifications = await getNotificationsForUser(user.id);
  const unread = await getUnreadNotificationCount(user.id);
  return NextResponse.json({ notifications, unread });
}
