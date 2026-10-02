// Оповещения владельцу об ошибках на проде — в Telegram. Получатель:
// OWNER_TELEGRAM_CHAT_ID из .env.local, иначе Telegram владельца платформы
// (users.is_platform_owner). Не спамим: одинаковая ошибка — не чаще раза в
// 30 минут, всего — не больше 20 сообщений в час. Сама отправка никогда не
// бросает исключений (иначе ошибка в оповещении породила бы новую ошибку).
// Относительные импорты — модуль вызывается и из instrumentation (вне app/).
import { escapeTelegramHtml, sendTelegramMessage } from "./telegram";

const SAME_ERROR_COOLDOWN_MS = 30 * 60 * 1000;
const MAX_PER_HOUR = 20;

const g = globalThis as unknown as {
  __alertSeen?: Map<string, number>;
  __alertSent?: number[];
  __ownerChat?: { id: string | null; at: number };
};
const seen = (g.__alertSeen ??= new Map());
const sent = (g.__alertSent ??= []);

async function ownerChatId(): Promise<string | null> {
  if (process.env.OWNER_TELEGRAM_CHAT_ID) return process.env.OWNER_TELEGRAM_CHAT_ID;
  if (g.__ownerChat && Date.now() - g.__ownerChat.at < 10 * 60 * 1000) return g.__ownerChat.id;
  try {
    const { db } = await import("./db/client");
    const { sql } = await import("drizzle-orm");
    const r = await db.execute(sql`select telegram_chat_id from users where is_platform_owner and telegram_chat_id is not null limit 1`);
    const id = ((r.rows[0] as { telegram_chat_id?: string } | undefined)?.telegram_chat_id ?? null) as string | null;
    g.__ownerChat = { id, at: Date.now() };
    return id;
  } catch {
    return null;
  }
}

/** Первая строка сообщения без чисел/хешей — чтобы одна и та же ошибка
 * с разными id считалась одной. */
export function errorFingerprint(source: string, message: string): string {
  const first = (message.split("\n")[0] || "").slice(0, 200);
  return `${source}:${first.replace(/[0-9a-f]{8,}/gi, "#").replace(/\d+/g, "N")}`;
}

export async function reportError(e: { source: "server" | "client" | "bot"; message: string; stack?: string; path?: string; extra?: string }) {
  try {
    if (process.env.NODE_ENV !== "production") return;
    const now = Date.now();
    const fp = errorFingerprint(e.source, e.message);
    const last = seen.get(fp);
    if (last && now - last < SAME_ERROR_COOLDOWN_MS) return;
    while (sent.length && now - sent[0] > 3600 * 1000) sent.shift();
    if (sent.length >= MAX_PER_HOUR) return;
    seen.set(fp, now);
    if (seen.size > 500) seen.clear();

    const chat = await ownerChatId();
    if (!chat) return;
    sent.push(now);
    const where = { server: "🖥 Сервер", client: "📱 Браузер пользователя", bot: "🤖 Бот" }[e.source];
    const stack = (e.stack || "").split("\n").slice(1, 5).join("\n");
    const text =
      `⚠️ <b>Ошибка на Планиметрике</b> · ${where}\n` +
      (e.path ? `Страница: <code>${escapeTelegramHtml(e.path.slice(0, 200))}</code>\n` : "") +
      `<pre>${escapeTelegramHtml(e.message.slice(0, 600))}${stack ? "\n" + escapeTelegramHtml(stack.slice(0, 800)) : ""}</pre>` +
      (e.extra ? `\n${escapeTelegramHtml(e.extra.slice(0, 200))}` : "") +
      `\n\nТакая же ошибка в ближайшие 30 минут повторно не придёт.`;
    await sendTelegramMessage(chat, text);
  } catch {
    // оповещение — не критичный путь
  }
}
