"use server";

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isStandaloneStudent, createPendingPayment, genId } from "@/lib/queries";
import { createYooKassaPayment, isYooKassaConfigured } from "@/lib/yookassa";

// Цена и период по умолчанию — можно поменять без деплоя кода через
// переменные окружения, если решите пересмотреть тариф.
const PRICE_RUB = Number(process.env.YOOKASSA_PRICE_RUB || 249);
const PERIOD_DAYS = Number(process.env.YOOKASSA_PERIOD_DAYS || 30);

// Тариф репетитора — отдельная цена/период, тоже настраиваемые без деплоя.
const TEACHER_PRICE_RUB = Number(process.env.YOOKASSA_TEACHER_PRICE_RUB || 1499);
const TEACHER_PERIOD_DAYS = Number(process.env.YOOKASSA_TEACHER_PERIOD_DAYS || 30);

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
      paymentType: "student_pro",
    });
    confirmationUrl = payment.confirmationUrl;
  } catch (e) {
    console.error("Ошибка создания платежа ЮKassa:", e);
    redirect("/student/upgrade?error=payment_failed");
  }

  redirect(confirmationUrl);
}

/**
 * Тариф репетитора — ПЕРВЫЙ платёж, с явным согласием на автосписания
 * (save_payment_method:true). Чекбокс согласия проверяется на самой
 * странице (app/teacher/upgrade/page.tsx) перед отправкой формы — юридически
 * обязательно для рекуррентных платежей (см. lib/yookassa.ts).
 *
 * ВАЖНО: по документации ЮKassa автоплатежи по умолчанию работают только
 * в тестовом магазине — на реальном требуется отдельное разрешение
 * менеджера ЮKassa. Без этого разрешения save_payment_method просто не
 * сработает по факту (deньги за первый месяц спишутся нормально, но
 * способ оплаты не сохранится, и автопродление на второй месяц не
 * случится) — это ограничение самой ЮKassa, не код.
 */
export async function startTeacherPaymentAction(_prevState: unknown, formData: FormData) {
  const user = await getSessionUser();
  if (!user || user.role !== "TEACHER") {
    redirect("/login");
  }
  const consent = formData.get("recurringConsent");
  if (consent !== "on") {
    return { error: "Нужно согласиться на условия автопродления, чтобы продолжить" };
  }
  if (!isYooKassaConfigured()) {
    redirect("/teacher/upgrade?error=payment_not_configured");
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const idempotenceKey = genId("idem");

  let confirmationUrl: string;
  try {
    const payment = await createYooKassaPayment({
      amountRub: TEACHER_PRICE_RUB,
      description: `Планиметрика для репетитора — ${TEACHER_PERIOD_DAYS} дней`,
      returnUrl: `${appUrl}/teacher/upgrade?paid=1`,
      idempotenceKey,
      metadata: { userId: user!.id, type: "teacher_pro" },
      savePaymentMethod: true,
    });
    await createPendingPayment({
      userId: user!.id,
      yookassaPaymentId: payment.id,
      amountRub: TEACHER_PRICE_RUB,
      periodDays: TEACHER_PERIOD_DAYS,
      paymentType: "teacher_pro",
      isRecurringSetup: true,
    });
    confirmationUrl = payment.confirmationUrl;
  } catch (e) {
    console.error("Ошибка создания платежа ЮKassa (тариф репетитора):", e);
    redirect("/teacher/upgrade?error=payment_failed");
  }

  redirect(confirmationUrl);
}
