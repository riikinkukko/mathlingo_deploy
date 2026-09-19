import { NextResponse } from "next/server";
import { isValidTelegramSecret, sendTelegramMessage } from "@/lib/telegram";
import { linkTelegramAccountByCode } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * Telegram шлёт сюда POST на каждое новое сообщение/событие в чате с ботом.
 * Нас интересует ровно одно: "/start <код>" — момент, когда пользователь
 * впервые запускает бота по нашей t.me-ссылке (см. lib/telegram.ts).
 *
 * Проверка подлинности — секрет в заголовке (Telegram сам присылает то же
 * значение, что мы передали при регистрации вебхука через setWebhook), а не
 * IP — у Telegram нет документированного списка адресов для этого, в
 * отличие от ЮKassa.
 */
export async function POST(req: Request) {
  // Логируем КАЖДЫЙ входящий вызов вебхука — раньше здесь не было ни
  // единого console.log, и если баг был именно в том, что Telegram вообще
  // не достучался до сервера (неверный секрет на проде, nginx не
  // прокидывает заголовок и т.п.), в pm2-логах не было ни следа — вебхук
  // с виду "просто ничего не делал". Теперь любая причина отказа видна.
  const secretHeader = req.headers.get("x-telegram-bot-api-secret-token");
  if (!isValidTelegramSecret(secretHeader)) {
    console.error(
      "[telegram-webhook] Отклонён: неверный или отсутствующий секрет в заголовке.",
      "Заголовок получен:", secretHeader ? `да, длина ${secretHeader.length}` : "нет вообще",
      "— проверьте TELEGRAM_WEBHOOK_SECRET в .env.local на сервере и что nginx пробрасывает этот заголовок."
    );
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let update: any;
  try {
    update = await req.json();
  } catch (e) {
    console.error("[telegram-webhook] Тело запроса не распарсилось как JSON:", e);
    return NextResponse.json({ ok: true }); // отвечаем 200 в любом случае — так просит Telegram
  }

  const message = update?.message;
  const text: string | undefined = message?.text;
  const chatId: string | undefined = message?.chat?.id?.toString();
  console.log("[telegram-webhook] Входящее сообщение:", { chatId, text });

  // ВАЖНО: сначала выполняем всю работу с БД (быстро, локальный Postgres),
  // но НЕ ждём здесь отправку ответного сообщения в Telegram — это исходящий
  // запрос к api.telegram.org, а сеть до Telegram с VPS иногда виснет.
  // Раньше `await sendTelegramMessage(...)` стоял ДО return, и зависшая
  // отправка не давала вебхуку вовремя ответить 200 OK на ЭТОТ ЖЕ входящий
  // запрос — Telegram фиксировал у себя "Connection timed out" и переставал
  // присылать новые апдейты вообще (см. getWebhookInfo). Теперь отправка
  // сообщения запускается ПОСЛЕ того, как мы уже ответили Telegram, и её
  // возможное зависание (с таймаутом 8с внутри sendTelegramMessage) больше
  // не блокирует подтверждение доставки текущего апдейта.
  let replyText: string | null = null;
  if (text && chatId && text.startsWith("/start")) {
    const code = text.replace("/start", "").trim();
    if (code) {
      const linked = await linkTelegramAccountByCode(code, chatId);
      console.log("[telegram-webhook] Попытка привязки по коду", JSON.stringify(code), "->", linked ? "успех" : "код не найден в БД (устарел/уже использован/опечатка)");
      replyText = linked
        ? "✅ Готово! Аккаунт привязан — теперь уведомления из Планиметрики будут приходить сюда."
        : "Не нашли код привязки. Вернитесь в приложение и нажмите «Подключить Telegram» ещё раз — ссылка одноразовая.";
    } else {
      replyText = "Привет! Чтобы подключить уведомления, перейдите по ссылке из профиля в Планиметрике — не открывайте бота напрямую.";
    }
  }

  if (replyText && chatId) {
    // Намеренно без await — fire-and-forget. Процесс живёт постоянно (PM2,
    // не serverless), так что промис спокойно доработает в фоне уже после
    // того, как HTTP-ответ ниже уйдёт Telegram.
    sendTelegramMessage(chatId, replyText).catch((e) =>
      console.error("[telegram-webhook] Не удалось отправить ответное сообщение (не блокирует доставку апдейта):", e)
    );
  }

  // Telegram ожидает именно 200 OK как подтверждение получения — иначе
  // будет повторять доставку этого же обновления. Отвечаем сразу, не
  // дожидаясь исходящего сообщения (см. комментарий выше).
  return NextResponse.json({ ok: true });
}
