/**
 * Тонкий клиент Telegram Bot API. Как и с ЮKassa — я не могу протестировать
 * этот файл end-to-end сам: нужен реальный токен бота от @BotFather,
 * которого у меня нет и быть не может. Реализовано аккуратно по
 * документации Telegram Bot API, финальная проверка на живых сообщениях —
 * со стороны того, у кого есть токен.
 *
 * Все переменные окружения ниже читаются с .trim() — при копировании из
 * Telegram/личного кабинета Vercel очень легко случайно захватить пробел
 * или перенос строки, и тогда сравнение/URL молча не совпадёт без единой
 * ошибки в логах. Дешёвая защита, которая экономит часы отладки "почему-то
 * не работает".
 */

const API_BASE = "https://api.telegram.org";

function getBotToken(): string | null {
  const raw = process.env.TELEGRAM_BOT_TOKEN;
  return raw ? raw.trim() : null;
}

export function isTelegramConfigured(): boolean {
  return !!getBotToken();
}

/** Возвращает имя бота БЕЗ ведущего "@" — Telegram сам показывает имя бота
 * именно с "@" (например, в самом чате или в @BotFather), и легко случайно
 * скопировать его вместе с символом в переменную окружения. Ссылка вида
 * t.me/@имя_бота не работает — t.me ожидает имя без "@". */
export function getTelegramBotUsername(): string | null {
  const raw = process.env.TELEGRAM_BOT_USERNAME;
  if (!raw) return null;
  return raw.trim().replace(/^@/, "");
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
  const token = getBotToken();
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
export async function setTelegramWebhook(
  webhookUrl: string,
  secretToken: string
): Promise<{ ok: boolean; description?: string }> {
  const token = getBotToken();
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
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!expected || !headerValue) return false;
  return headerValue.trim() === expected;
}
