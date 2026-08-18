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
  const secretHeader = req.headers.get("x-telegram-bot-api-secret-token");
  if (!isValidTelegramSecret(secretHeader)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let update: any;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true }); // отвечаем 200 в любом случае — так просит Telegram
  }

  const message = update?.message;
  const text: string | undefined = message?.text;
  const chatId: string | undefined = message?.chat?.id?.toString();

  if (text && chatId && text.startsWith("/start")) {
    const code = text.replace("/start", "").trim();
    if (code) {
      const linked = await linkTelegramAccountByCode(code, chatId);
      await sendTelegramMessage(
        chatId,
        linked
          ? "✅ Готово! Аккаунт привязан — теперь уведомления из Планиметрики будут приходить сюда."
          : "Не нашли код привязки. Вернитесь в приложение и нажмите «Подключить Telegram» ещё раз — ссылка одноразовая."
      );
    } else {
      await sendTelegramMessage(
        chatId,
        "Привет! Чтобы подключить уведомления, перейдите по ссылке из профиля в Планиметрике — не открывайте бота напрямую."
      );
    }
  }

  // Telegram ожидает именно 200 OK как подтверждение получения — иначе
  // будет повторять доставку этого же обновления.
  return NextResponse.json({ ok: true });
}
