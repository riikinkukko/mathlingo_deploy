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
process.env.PUSH_DISABLED = "1";
delete process.env.SMTP_HOST;
delete process.env.YOOKASSA_SHOP_ID;

// Компоненты (чертежи) написаны под автоматический JSX Next.js; tsx в тестах
// собирает их классическим React.createElement — даём ему глобальный React.
import * as React from "react";
(globalThis as { React?: typeof React }).React = React;
