/**
 * Проверка интеграции с Telegram после того, как получены реальные
 * TELEGRAM_BOT_TOKEN / TELEGRAM_BOT_USERNAME / TELEGRAM_WEBHOOK_SECRET.
 * Не подменяет ручную проверку самой привязки (для неё нужен реальный
 * Telegram-клиент), но быстро подтверждает, что sendMessage в принципе
 * достучался до Bot API с вашим токеном.
 *
 * Запуск: npx tsx --env-file=.env.local scripts/dev/test-telegram-send.ts <chat_id>
 * chat_id можно узнать, написав боту @userinfobot в Telegram.
 */
import { sendTelegramMessage, isTelegramConfigured } from "../../lib/telegram";

async function main() {
  const chatId = process.argv[2];
  if (!isTelegramConfigured()) {
    console.error("TELEGRAM_BOT_TOKEN не задан в .env.local — нечего проверять.");
    process.exit(1);
  }
  if (!chatId) {
    console.error("Укажите chat_id первым аргументом: npx tsx ... scripts/dev/test-telegram-send.ts 123456789");
    process.exit(1);
  }
  console.log(`Отправляю тестовое сообщение в чат ${chatId}...`);
  const ok = await sendTelegramMessage(chatId, "✅ Тестовое сообщение от Планиметрики — интеграция работает.");
  console.log(ok ? "Успешно отправлено." : "Не удалось отправить — см. лог ошибки выше.");
  process.exit(ok ? 0 : 1);
}
main();
