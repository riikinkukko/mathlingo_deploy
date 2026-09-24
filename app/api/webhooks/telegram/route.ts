import { NextResponse } from "next/server";
import { isValidTelegramSecret } from "@/lib/telegram";
import { handleTelegramUpdate } from "@/lib/telegram-updates";

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

  // Обработка — в общем модуле (тот же код использует long-polling
  // воркер scripts/telegram-poller.ts, основной способ получения апдейтов).
  // Без await: отвечаем Telegram 200 OK сразу, чтобы медленная исходящая
  // отправка ответа не приводила к таймауту доставки вебхука.
  handleTelegramUpdate(update).catch((e) =>
    console.error("[telegram-webhook] Ошибка обработки апдейта:", e)
  );

  // Telegram ожидает именно 200 OK как подтверждение получения — иначе
  // будет повторять доставку этого же обновления. Отвечаем сразу, не
  // дожидаясь исходящего сообщения (см. комментарий выше).
  return NextResponse.json({ ok: true });
}
