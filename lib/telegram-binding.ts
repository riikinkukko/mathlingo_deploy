import { createHmac } from "node:crypto";

export type TelegramBinding = { chatId: string; version: string };

/** Compact authentication tag so existing resource IDs fit Telegram callback_data. */
export function boundTelegramCallback(data: string, version: string): string {
  const tag = createHmac("sha256", version).update(data).digest("base64url").slice(0, 12);
  return tag + ":" + data;
}

export function readTelegramCallbackPayload(value: unknown): string | undefined {
  if (typeof value !== "string" || Buffer.byteLength(value) > 64) return;
  return value.slice(13) || undefined;
}

export function readBoundTelegramCallback(value: unknown, version: string): string | undefined {
  const data = readTelegramCallbackPayload(value);
  return data && boundTelegramCallback(data, version) === value ? data : undefined;
}
