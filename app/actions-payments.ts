"use server";

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isStandaloneStudent, createPendingPayment, genId } from "@/lib/queries";
import { createYooKassaPayment, isYooKassaConfigured } from "@/lib/yookassa";

// Цена и период по умолчанию — можно поменять без деплоя кода через
// переменные окружения, если решите пересмотреть тариф.
const PRICE_RUB = Number(process.env.YOOKASSA_PRICE_RUB || 399);
const PERIOD_DAYS = Number(process.env.YOOKASSA_PERIOD_DAYS || 30);

export async function startPaymentAction() {
  const user = await getSessionUser();
  if (!user || !isStandaloneStudent(user)) {
    redirect("/student");
  }
  if (!isYooKassaConfigured()) {
    // ЮKassa не настроена (нет ключей в переменных окружения) — такого не
    // должно случиться, если кнопка показывается только при настроенной
    // оплате (см. /student/upgrade), но на всякий случай не роняем всё
    // приложение, а просто возвращаем на страницу тарифа.
    redirect("/student/upgrade?error=payment_not_configured");
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const idempotenceKey = genId("idem");

  let confirmationUrl: string;
  try {
    const payment = await createYooKassaPayment({
      amountRub: PRICE_RUB,
      description: `Планиметрика Pro — ${PERIOD_DAYS} дней`,
      returnUrl: `${appUrl}/student/upgrade?paid=1`,
      idempotenceKey,
      metadata: { userId: user!.id },
    });
    await createPendingPayment({
      userId: user!.id,
      yookassaPaymentId: payment.id,
      amountRub: PRICE_RUB,
      periodDays: PERIOD_DAYS,
    });
    confirmationUrl = payment.confirmationUrl;
  } catch (e) {
    console.error("Ошибка создания платежа ЮKassa:", e);
    redirect("/student/upgrade?error=payment_failed");
  }

  redirect(confirmationUrl);
}
