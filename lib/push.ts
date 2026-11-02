/**
 * Push-уведомления в мобильное приложение через Expo Push Service
 * (https://docs.expo.dev/push-notifications/sending-notifications/).
 * Expo сам доставляет через FCM (Android) и APNs (iOS). Ошибки доставки не
 * ломают основное действие: отправка — фоном, с логированием.
 */
import { eq, inArray } from "drizzle-orm";
import { db } from "./db/client";
import * as schema from "./db/schema";

const EXPO_PUSH_URL = process.env.EXPO_PUSH_URL || "https://exp.host/--/api/v2/push/send";
const TOKEN_RE = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/;

export function isExpoPushToken(token: unknown): token is string {
  return typeof token === "string" && token.length < 200 && TOKEN_RE.test(token);
}

export async function savePushToken(userId: string, token: string, platform: string) {
  const p = platform === "ios" ? "ios" : "android";
  await db
    .insert(schema.pushTokens)
    .values({ token, userId, platform: p })
    .onConflictDoUpdate({ target: schema.pushTokens.token, set: { userId, platform: p, lastSeenAt: new Date() } });
}

export async function deletePushToken(userId: string, token: string) {
  const rows = await db.select().from(schema.pushTokens).where(eq(schema.pushTokens.token, token)).limit(1);
  if (rows[0]?.userId === userId) await db.delete(schema.pushTokens).where(eq(schema.pushTokens.token, token));
}

interface ExpoTicket {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
}

/** Отправить push на все устройства пользователя. Никогда не бросает. */
export async function sendPushToUser(
  userId: string,
  msg: { title: string; body: string; link?: string }
): Promise<void> {
  if (process.env.PUSH_DISABLED === "1") return;
  try {
    const tokens = await db.select().from(schema.pushTokens).where(eq(schema.pushTokens.userId, userId));
    if (tokens.length === 0) return;
    const messages = tokens.map((t) => ({
      to: t.token,
      title: msg.title.slice(0, 120),
      body: msg.body.slice(0, 300),
      sound: "default",
      channelId: "default",
      data: { link: msg.link ?? "" },
    }));
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error("[push] Expo ответил", res.status);
      return;
    }
    const json = (await res.json()) as { data?: ExpoTicket[] };
    const dead = (json.data ?? [])
      .map((ticket, i) => (ticket.details?.error === "DeviceNotRegistered" ? tokens[i]?.token : null))
      .filter((t): t is string => !!t);
    if (dead.length) await db.delete(schema.pushTokens).where(inArray(schema.pushTokens.token, dead));
  } catch (e) {
    console.error("[push] не удалось отправить:", e);
  }
}
