// Подключается через --import ДО кода приложения: переключает приложение на
// тестовую базу и выключает реальные отправки (Telegram, почта).
import { config } from "dotenv";
config({ path: ".env.local" });

const url = process.env.TEST_DATABASE_URL;
if (!url || !/test/i.test(new URL(url).pathname)) {
  console.error("Тесты запускаются только на тестовой базе: задайте TEST_DATABASE_URL (имя базы с «test»).");
  process.exit(1);
}
process.env.DATABASE_URL = url;
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.SMTP_HOST;
delete process.env.YOOKASSA_SHOP_ID;
