/**
 * Регистрирует вебхук в Telegram — выполняется ОДИН РАЗ после деплоя (и
 * повторно, если домен когда-нибудь сменится). Использует уже проверенную
 * функцию setTelegramWebhook() из lib/telegram.ts вместо ручного curl —
 * на Windows/PowerShell легко напутать с экранированием кавычек в JSON,
 * здесь этой проблемы просто нет.
 *
 * Запуск (без https://, без слэша в конце, без /api/... — только сам домен):
 *   npx tsx scripts/dev/register-telegram-webhook.ts ваш-домен.vercel.app
 */
import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(__dirname, "../../.env.local") });

import { setTelegramWebhook } from "../../lib/telegram";

async function main() {
  const domain = process.argv[2];
  if (!domain) {
    console.error(
      "Укажите домен первым аргументом, например:\n  npx tsx scripts/dev/register-telegram-webhook.ts ваш-домен.vercel.app"
    );
    process.exit(1);
  }
  if (domain.startsWith("http")) {
    console.error("Домен должен быть БЕЗ https:// в начале — просто ваш-домен.vercel.app");
    process.exit(1);
  }

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error("TELEGRAM_WEBHOOK_SECRET не задан в .env.local — нечего регистрировать.");
    process.exit(1);
  }

  const webhookUrl = `https://${domain}/api/webhooks/telegram`;
  console.log(`Регистрирую вебхук: ${webhookUrl}`);

  const result = await setTelegramWebhook(webhookUrl, secret);
  if (result.ok) {
    console.log("✅ Готово! Telegram подтвердил регистрацию вебхука.");
    console.log("Проверить результат: npx tsx scripts/dev/diagnose-telegram.ts");
  } else {
    console.error("❌ Telegram отклонил регистрацию:", result.description);
  }
  process.exit(result.ok ? 0 : 1);
}

main();
