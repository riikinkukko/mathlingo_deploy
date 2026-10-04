"use server";

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isStandaloneStudent, createPendingPayment, genId } from "@/lib/queries";
import { createYooKassaPayment, isYooKassaConfigured } from "@/lib/yookassa";
import { TEACHER_TIERS, isBillingPeriod, isTeacherTier, periodDays, tierPrice } from "@/lib/teacher-plan";
import { checkPromo, discountedPrice } from "@/lib/promo";
import type { User } from "@/lib/types";

/** Скидка по промокоду из формы: цена и код для платежа (или ошибка). */
async function applyPromoToPrice(
  formData: FormData | undefined,
  user: User,
  price: number
): Promise<{ amountRub: number; promoCode: string | null } | { error: string }> {
  const raw = formData?.get("promo");
  if (!raw || !String(raw).trim()) return { amountRub: price, promoCode: null };
  const check = await checkPromo(raw, user);
  if (!check.ok) return { error: check.error };
  if (check.promo.kind !== "percent") return { error: "Этот промокод даёт дни, а не скидку — активируйте его отдельно" };
  return { amountRub: discountedPrice(price, check.promo.value), promoCode: check.promo.code };
}

// Цена и период по умолчанию — можно поменять без деплоя кода через
// переменные окружения, если решите пересмотреть тариф.
const PRICE_RUB = Number(process.env.YOOKASSA_PRICE_RUB || 249);
const PERIOD_DAYS = Number(process.env.YOOKASSA_PERIOD_DAYS || 30);

// Тариф репетитора — отдельная цена/период, тоже настраиваемые без деплоя.
// Цены тарифов репетитора — в lib/teacher-plan.ts (ступени и периоды).

export async function startPaymentAction(formData?: FormData) {
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

  const priced = await applyPromoToPrice(formData, user!, PRICE_RUB);
  if ("error" in priced) redirect(`/student/upgrade?promoError=${encodeURIComponent(priced.error)}`);
  const { amountRub: studentAmount, promoCode: studentPromo } = priced as { amountRub: number; promoCode: string | null };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const idempotenceKey = genId("idem");

  let confirmationUrl: string;
  try {
    const payment = await createYooKassaPayment({
      amountRub: studentAmount,
      description: `Планиметрика Pro — ${PERIOD_DAYS} дней`,
      returnUrl: `${appUrl}/student/upgrade?paid=1`,
      idempotenceKey,
      metadata: { userId: user!.id },
    });
    await createPendingPayment({
      userId: user!.id,
      yookassaPaymentId: payment.id,
      amountRub: studentAmount,
      periodDays: PERIOD_DAYS,
      paymentType: "student_pro",
      promoCode: studentPromo,
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
  const tier = formData.get("tier");
  const period = formData.get("period");
  if (!isTeacherTier(tier) || !isBillingPeriod(period)) return { error: "Выберите тариф и период" };
  const priced = await applyPromoToPrice(formData, user!, tierPrice(tier, period));
  if ("error" in priced) return { error: priced.error };
  const { amountRub, promoCode } = priced;
  const days = periodDays(period);
  const tierName = TEACHER_TIERS[tier].name;
  if (!isYooKassaConfigured()) {
    redirect("/teacher/upgrade?error=payment_not_configured");
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const idempotenceKey = genId("idem");

  let confirmationUrl: string;
  try {
    const payment = await createYooKassaPayment({
      amountRub,
      description: `Планиметрика для репетитора — тариф «${tierName}», ${period === "year" ? "год" : "месяц"}`,
      returnUrl: `${appUrl}/teacher/upgrade?paid=1`,
      idempotenceKey,
      metadata: { userId: user!.id, type: "teacher_pro", tier, period },
      savePaymentMethod: true,
    });
    await createPendingPayment({
      userId: user!.id,
      yookassaPaymentId: payment.id,
      amountRub,
      periodDays: days,
      paymentType: "teacher_pro",
      isRecurringSetup: true,
      tier,
      billingPeriod: period,
      promoCode,
    });
    confirmationUrl = payment.confirmationUrl;
  } catch (e) {
    console.error("Ошибка создания платежа ЮKassa (тариф репетитора):", e);
    redirect("/teacher/upgrade?error=payment_failed");
  }

  redirect(confirmationUrl);
}
