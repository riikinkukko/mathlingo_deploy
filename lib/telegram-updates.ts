import { sendTelegramMessage } from "./telegram";
import { linkTelegramAccountByCode } from "./queries";
import { handleCallbackQuery, replyToday } from "./teacher-telegram";

/**
 * Общая обработка одного апдейта от Telegram. Используется в двух местах:
 * - scripts/telegram-poller.ts — основной способ (long polling, сервер сам
 *   забирает апдейты у Telegram исходящими запросами);
 * - app/api/webhooks/telegram/route.ts — запасной (вебхук), если когда-нибудь
 *   входящие соединения от Telegram до сервера станут стабильными.
 *
 * Почему основной способ — polling: входящие соединения от серверов Telegram
 * до VPS периодически таймаутили (getWebhookInfo: "Connection timed out"),
 * апдейты доходили только спустя сутки ретраев. Исходящие же запросы с
 * сервера к api.telegram.org работают (getMe в diagnose-telegram.ts проходит).
 */
export async function handleTelegramUpdate(update: any): Promise<void> {
  // Кнопки «Было / Не было» под вопросом о прошедшем занятии.
  if (update?.callback_query) {
    const cq = update.callback_query;
    // Кнопки работают только в личном чате с ботом и только у его владельца:
    // если бота добавили в групповой чат, другие участники не должны
    // отмечать занятия за репетитора.
    if (cq?.message?.chat?.type !== "private" || String(cq?.from?.id) !== String(cq?.message?.chat?.id)) return;
    await handleCallbackQuery(cq);
    return;
  }

  const message = update?.message;
  const text: string | undefined = message?.text;
  const chatId: string | undefined = message?.chat?.id?.toString();
  console.log("[telegram] Входящее сообщение:", { chatId, text });

  if (!text || !chatId) return;
  // Привязка и /today — только в личном чате с ботом.
  if (message?.chat?.type !== "private") return;
  if (/^\/today(@\w+)?$/.test(text.trim())) {
    await replyToday(chatId);
    return;
  }
  if (!text.startsWith("/start")) return;

  const code = text.replace("/start", "").trim();
  let replyText: string;
  if (code) {
    const linked = await linkTelegramAccountByCode(code, chatId);
    console.log(
      "[telegram] Привязка по коду",
      JSON.stringify(code),
      "->",
      linked ? "успех" : "код не найден в БД (устарел/уже использован)"
    );
    replyText = linked
      ? "✅ Готово! Аккаунт привязан — теперь уведомления из Планиметрики будут приходить сюда.\n\nРепетиторам: /today — занятия и дела на сегодня."
      : "Не нашли код привязки. Вернитесь в приложение, обновите страницу профиля и нажмите «Подключить Telegram» ещё раз — ссылка одноразовая.";
  } else {
    replyText =
      "Привет! Чтобы подключить уведомления, перейдите по ссылке из профиля в Планиметрике — не открывайте бота напрямую.";
  }

  await sendTelegramMessage(chatId, replyText);
}
