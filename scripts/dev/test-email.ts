/**
 * Проверка отправки почты одной командой — запускать НА СЕРВЕРЕ:
 *   npx tsx scripts/dev/test-email.ts ваш@email.ru
 *
 * Печатает понятный вердикт по каждой частой причине "почта не работает":
 * не заданы переменные, закрыт порт на VPS, неверный логин/пароль,
 * отправитель не совпадает с тем, что выбран в SMTP-подключении Rusender.
 */
import { config } from "dotenv";
import path from "path";
import net from "net";
config({ path: path.resolve(__dirname, "../../.env.local") });

import nodemailer from "nodemailer";

function checkPort(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: 8000 });
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => resolve(false));
  });
}

async function main() {
  const to = process.argv[2];
  if (!to) {
    console.log("Укажите адрес: npx tsx scripts/dev/test-email.ts ваш@email.ru");
    process.exit(1);
  }

  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD?.trim();
  const from = process.env.SMTP_FROM?.trim();

  console.log("=== 1. Переменные в .env.local ===");
  console.log("SMTP_HOST:", host || "❌ НЕ ЗАДАН");
  console.log("SMTP_PORT:", port);
  console.log("SMTP_USER:", user ? "задан" : "❌ НЕ ЗАДАН");
  console.log("SMTP_PASSWORD:", pass ? "задан" : "❌ НЕ ЗАДАН");
  console.log("SMTP_FROM:", from || "❌ НЕ ЗАДАН (нужен адрес отправителя из Rusender)");
  if (!host || !user || !pass) process.exit(1);

  console.log(`\n=== 2. Открыт ли порт ${port} с этого сервера? ===`);
  const open = await checkPort(host, port);
  if (!open) {
    console.log(
      `❌ Порт ${port} недоступен. На Timeweb Cloud порты 465/587 закрыты по умолчанию — ` +
        "разблокируйте в панели сервера (раздел «Сеть»/порты) или через поддержку, затем повторите."
    );
    process.exit(1);
  }
  console.log("✅ Порт открыт.");

  console.log("\n=== 3. Авторизация и отправка тестового письма ===");
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    auth: { user, pass },
  });
  try {
    await transporter.verify();
    console.log("✅ Логин/пароль приняты.");
  } catch (e: any) {
    console.log("❌ SMTP-сервер отклонил логин/пароль:", e?.message || e);
    console.log("   Проверьте SMTP_USER/SMTP_PASSWORD — копируйте из карточки SMTP-подключения в Rusender.");
    process.exit(1);
  }
  try {
    const info = await transporter.sendMail({
      from: from || user,
      to,
      subject: "Тест почты Планиметрики",
      html: "<p>Если вы видите это письмо — почта на сервере настроена правильно ✅</p>",
    });
    console.log("✅ Письмо отправлено:", info.messageId);
    console.log(`   Проверьте ящик ${to} (и папку «Спам»).`);
  } catch (e: any) {
    console.log("❌ Отправка не удалась:", e?.message || e);
    console.log(
      "   Частая причина: SMTP_FROM не совпадает с отправителем, выбранным при создании SMTP-подключения в Rusender."
    );
    process.exit(1);
  }
}

main();
