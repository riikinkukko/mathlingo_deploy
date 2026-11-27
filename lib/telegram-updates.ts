import { lt, sql } from "drizzle-orm";
import { db } from "./db/client";
import { telegramUpdates } from "./db/schema";
import { sendTelegramMessage } from "./telegram";
import { linkTelegramAccountByCode } from "./queries";
import { handleCallbackQuery, replyToday } from "./teacher-telegram";
import { handleTelegramReportText } from "./lesson-report";

async function claimUpdate(id: unknown): Promise<boolean> {
  if (typeof id !== "number" || !Number.isInteger(id) || id < 0 || id > 2147483647) return false;
  const claimed = await db.insert(telegramUpdates).values({ id }).onConflictDoNothing().returning({ id: telegramUpdates.id });
  if (!claimed.length) return false;
  await db.delete(telegramUpdates).where(lt(telegramUpdates.receivedAt, sql`now() - interval '48 hours'`));
  return true;
}

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
    if (await claimUpdate(update.update_id)) await handleCallbackQuery(cq);
    return;
  }

  const message = update?.message;
  const text: string | undefined = message?.text;
  const chatId: string | undefined = message?.chat?.id?.toString();

  if (!text || !chatId) return;
  // Привязка и /today — только в личном чате с ботом.
  if (message?.chat?.type !== "private" || String(message.from?.id) !== chatId) return;
  if (!await claimUpdate(update.update_id)) return;
  // Бот ждёт отчёт о занятии (кнопка «Написать отчёт») — это сообщение и есть отчёт.
  const promptId = message.reply_to_message?.message_id;
  if (typeof promptId === "number") {
    await handleTelegramReportText(chatId, text, promptId);
    return;
  }
  if (/^\/today(@\w+)?$/.test(text.trim())) {
    await replyToday(chatId);
    return;
  }
  if (!text.startsWith("/start")) return;

  const code = text.replace("/start", "").trim();
  let replyText: string;
  if (code) {
    const linked = await linkTelegramAccountByCode(code, chatId, () =>
      sendTelegramMessage(chatId, "✅ Готово! Аккаунт привязан — теперь уведомления из Планиметрики будут приходить сюда.\n\nРепетиторам: /today — занятия и дела на сегодня."));
    if (linked) return;
    replyText = "Не нашли код привязки. Вернитесь в приложение, обновите страницу профиля и нажмите «Подключить Telegram» ещё раз — ссылка одноразовая.";
  } else {
    replyText =
      "Привет! Чтобы подключить уведомления, перейдите по ссылке из профиля в Планиметрике — не открывайте бота напрямую.";
  }

  await sendTelegramMessage(chatId, replyText);
}
