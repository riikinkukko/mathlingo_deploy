/**
 * Тонкий клиент Telegram Bot API. Как и с ЮKassa — я не могу протестировать
 * этот файл end-to-end сам: нужен реальный токен бота от @BotFather,
 * которого у меня нет и быть не может. Реализовано аккуратно по
 * документации Telegram Bot API, финальная проверка на живых сообщениях —
 * со стороны того, у кого есть токен.
 */

const API_BASE = "https://api.telegram.org";

export function isTelegramConfigured(): boolean {
  return !!process.env.TELEGRAM_BOT_TOKEN;
}

export function getTelegramBotUsername(): string | null {
  return process.env.TELEGRAM_BOT_USERNAME || null;
}

/** Ссылка вида t.me/бот?start=код — единственный способ дать боту написать
 * пользователю первым (Telegram запрещает ботам инициировать переписку). */
export function buildTelegramLinkUrl(code: string): string | null {
  const username = getTelegramBotUsername();
  if (!username) return null;
  return `https://t.me/${username}?start=${code}`;
}

/** Отправляет сообщение через Bot API. Не бросает исключение при сетевой
 * ошибке или ошибке самого Telegram (например, пользователь заблокировал
 * бота) — уведомление в самом приложении важнее, чем падение всего запроса
 * из-за недоступности Telegram. Ошибка просто логируется. */
export async function sendTelegramMessage(chatId: string, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  try {
    const res = await fetch(`${API_BASE}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      console.error("Telegram sendMessage вернул ошибку:", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (e) {
    console.error("Ошибка отправки сообщения в Telegram:", e);
    return false;
  }
}

/** Регистрирует вебхук в Telegram — вызывается ОДИН РАЗ вручную после
 * деплоя (не на каждый запрос), см. инструкцию в README. */
export async function setTelegramWebhook(webhookUrl: string, secretToken: string): Promise<{ ok: boolean; description?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN не задан");
  const res = await fetch(`${API_BASE}/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: webhookUrl, secret_token: secretToken }),
  });
  const data = await res.json();
  return { ok: !!data.ok, description: data.description };
}

/** Проверка заголовка X-Telegram-Bot-Api-Secret-Token — Telegram присылает
 * ровно то значение, что было передано при регистрации вебхука (setWebhook
 * выше). Это их рекомендованный способ убедиться, что запрос реально от
 * Telegram, а не от кого угодно, кто узнал URL вебхука. */
export function isValidTelegramSecret(headerValue: string | null): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return false;
  return headerValue === expected;
}
