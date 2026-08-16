import { NextResponse } from "next/server";
import { isYooKassaIp } from "@/lib/yookassa";
import { markPaymentSucceeded, markPaymentCanceled } from "@/lib/queries";

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
  const forwardedFor = req.headers.get("x-forwarded-for") || "";
  const clientIp = forwardedFor.split(",")[0].trim();

  if (!clientIp || !isYooKassaIp(clientIp)) {
    console.warn("Вебхук ЮKassa отклонён — IP не входит в список ЮKassa:", clientIp);
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { event?: string; object?: { id?: string; status?: string } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const paymentId = body?.object?.id;
  if (!paymentId) {
    return NextResponse.json({ error: "no payment id" }, { status: 400 });
  }

  try {
    if (body.event === "payment.succeeded") {
      await markPaymentSucceeded(paymentId);
    } else if (body.event === "payment.canceled") {
      await markPaymentCanceled(paymentId);
    }
    // Остальные события (payment.waiting_for_capture и т.п.) при
    // capture:true (см. lib/yookassa.ts) нам не встретятся — ЮKassa сама
    // списывает деньги сразу после подтверждения оплаты пользователем.
  } catch (e) {
    console.error("Ошибка обработки вебхука ЮKassa:", e);
    // Всё равно отвечаем 200 — иначе ЮKassa будет повторять доставку этого
    // же вебхука бесконечно. Ошибка уже залогирована для разбора вручную.
  }

  // ЮKassa ожидает именно 200 OK как подтверждение получения — не тело
  // ответа, просто статус.
  return NextResponse.json({ ok: true });
}
