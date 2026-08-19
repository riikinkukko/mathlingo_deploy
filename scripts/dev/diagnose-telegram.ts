/**
 * Полная диагностика Telegram-интеграции — прогоняет по всем частым
 * причинам "почему-то не работает" и печатает понятный вердикт по каждой.
 * Не требует уже привязанного пользователя — только переменные окружения.
 *
 * Запуск: npx tsx --env-file=.env.local scripts/dev/diagnose-telegram.ts
 */
import { isTelegramConfigured, getTelegramBotUsername } from "../../lib/telegram";

async function main() {
  console.log("=== 1. Переменные окружения ===");
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const username = getTelegramBotUsername();
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();

  console.log("TELEGRAM_BOT_TOKEN:", token ? `задан (${token.slice(0, 8)}...)` : "❌ НЕ ЗАДАН");
  console.log("TELEGRAM_BOT_USERNAME:", username ? `"${username}"` : "❌ НЕ ЗАДАН");
  console.log("TELEGRAM_WEBHOOK_SECRET:", secret ? "задан" : "❌ НЕ ЗАДАН");

  if (!isTelegramConfigured()) {
    console.log("\n❌ Токен не задан — дальше проверять нечего. См. README, раздел «Уведомления в Telegram».");
    process.exit(1);
  }

  console.log("\n=== 2. Токен реально валиден? (Bot API: getMe) ===");
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await res.json();
    if (!data.ok) {
      console.log("❌ Telegram отклонил токен:", data.description);
      process.exit(1);
    }
    console.log(`✅ Токен рабочий. Реальное имя бота у Telegram: "${data.result.username}"`);
    if (username && data.result.username !== username) {
      console.log(
        `⚠️  НЕСОВПАДЕНИЕ: TELEGRAM_BOT_USERNAME="${username}", а Telegram говорит, что бота зовут "${data.result.username}". Ссылка на привязку будет вести не туда — поправьте переменную.`
      );
    }
  } catch (e) {
    console.log("❌ Не удалось связаться с Telegram Bot API:", e);
    process.exit(1);
  }

  console.log("\n=== 3. Статус вебхука (Bot API: getWebhookInfo) ===");
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    const data = await res.json();
    const info = data.result;
    console.log("URL вебхука, который знает Telegram:", info.url || "❌ ПУСТО — вебхук не зарегистрирован вообще");
    if (!info.url) {
      console.log(
        "\n👉 Вебхук нужно зарегистрировать ОДИН РАЗ вручную curl-запросом (см. README) — без него Telegram никогда не отправит вам ни одного /start."
      );
    }
    console.log("Ожидающих доставку обновлений:", info.pending_update_count);
    if (info.last_error_message) {
      console.log(`⚠️  Последняя ошибка доставки (от ${new Date(info.last_error_date * 1000).toLocaleString("ru-RU")}):`);
      console.log("   ", info.last_error_message);
      console.log(
        "   Частая причина: TELEGRAM_WEBHOOK_SECRET на Vercel отличается от того, что было передано при регистрации вебхука."
      );
    } else {
      console.log("✅ Ошибок доставки не зафиксировано.");
    }
  } catch (e) {
    console.log("❌ Не удалось получить статус вебхука:", e);
  }

  console.log("\nГотово.");
}

main();
