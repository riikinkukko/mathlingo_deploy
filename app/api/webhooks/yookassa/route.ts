import { NextResponse } from "next/server";
import { isYooKassaIp, getYooKassaPayment } from "@/lib/yookassa";
import { markPaymentSucceeded, markPaymentCanceled, getPaymentAmountRub } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * ЮKassa шлёт сюда POST при каждом изменении статуса платежа. Документация
 * ЮKassa рекомендует проверять IP отправителя вместо подписи (в отличие от
 * многих других платёжных систем) — см. lib/yookassa.ts.
 *
 * КРИТИЧНО ДЛЯ БЕЗОПАСНОСТИ: если не проверять источник запроса, кто угодно
 * мог бы отправить сюда поддельное "payment.succeeded" и получить Pro
 * бесплатно. Поэтому при непрохождении проверки IP — жёсткий отказ (403),
 * не "тихая" обработка.
 */
export async function POST(req: Request) {
  // X-Real-IP выставляет nginx из реального TCP-соединения — клиент подделать
  // его не может. Первый адрес X-Forwarded-For, наоборот, присылает сам клиент,
  // поэтому он только запасной вариант (например, без nginx).
  const clientIp =
    req.headers.get("x-real-ip")?.trim() || (req.headers.get("x-forwarded-for") || "").split(",").pop()!.trim();

  if (!clientIp || !isYooKassaIp(clientIp)) {
    console.warn("Вебхук ЮKassa отклонён — IP не входит в список ЮKassa:", clientIp);
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { event?: string; object?: { id?: string } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const paymentId = body?.object?.id;
  if (!paymentId || typeof paymentId !== "string") {
    return NextResponse.json({ error: "no payment id" }, { status: 400 });
  }

  // Тело уведомления НЕ считаем правдой: из него берём только id платежа, а
  // статус, сумму и способ оплаты перепроверяем прямым запросом к API ЮKassa.
  // Иначе можно было начать оплату, не платить и прислать сюда поддельное
  // "payment.succeeded" с реальным id своего платежа.
  let info;
  try {
    info = await getYooKassaPayment(paymentId);
  } catch (e) {
    console.error("Вебхук ЮKassa: не удалось проверить платёж через API:", e);
    // 500 — ЮKassa повторит доставку позже, когда API снова будет доступно.
    return NextResponse.json({ error: "verification failed" }, { status: 500 });
  }
  if (!info) {
    console.warn("Вебхук ЮKassa: платёж не найден в ЮKassa:", paymentId);
    return NextResponse.json({ ok: true });
  }

  try {
    if (info.status === "succeeded" && info.paid) {
      const expected = await getPaymentAmountRub(paymentId);
      if (expected === null) {
        console.warn("Вебхук ЮKassa: платёж не найден в нашей БД:", paymentId);
      } else if (Math.abs(expected - info.amountRub) > 0.001) {
        console.error("Вебхук ЮKassa: сумма не совпадает с ожидаемой", { paymentId, expected, got: info.amountRub });
      } else {
        // payment_method.saved:true — способ оплаты реально сохранён на
        // стороне ЮKassa (ЮKassa может отказать в сохранении для некоторых карт).
        const pm = info.paymentMethod;
        const savedMethod =
          pm?.saved && pm.id
            ? { id: pm.id, cardLast4: pm.card?.last4, cardType: pm.card?.card_type }
            : undefined;
        await markPaymentSucceeded(paymentId, savedMethod);
      }
    } else if (info.status === "canceled") {
      await markPaymentCanceled(paymentId);
    }
  } catch (e) {
    console.error("Ошибка обработки вебхука ЮKassa:", e);
    // Всё равно отвечаем 200 — иначе ЮKassa будет повторять доставку этого
    // же вебхука бесконечно. Ошибка уже залогирована для разбора вручную.
  }

  // ЮKassa ожидает именно 200 OK как подтверждение получения — не тело
  // ответа, просто статус.
  return NextResponse.json({ ok: true });
}
