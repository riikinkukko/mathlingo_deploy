"use server";

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isStandaloneStudent, createPendingPayment, genId } from "@/lib/queries";
import { createYooKassaPayment, isYooKassaConfigured } from "@/lib/yookassa";
import { TEACHER_TIERS, isBillingPeriod, isTeacherTier, periodDays, tierPrice } from "@/lib/teacher-plan";
import { checkPromo, discountedPrice } from "@/lib/promo";
import type { User } from "@/lib/types";
import { getStudentExamPass } from "@/lib/tariffs";
import { getOrCreatePayRequest, getPayRequest } from "@/lib/pay-requests";
import { isPaidReviewEnabled, prepareReviewOrder } from "@/lib/paid-review";

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

type StudentProduct = "month" | "exam";

/**
 * Платёж ученика: Pro на месяц или «До ЕГЭ» (до конца сезона). Возвращает
 * адрес формы ЮKassa или код ошибки для страницы, с которой пришли.
 */
async function createStudentPayment(params: {
  student: User;
  product: StudentProduct;
  formData?: FormData;
  returnUrl: string;
  /** платит взрослый по ссылке «Попросить родителя» */
  byParent?: boolean;
}): Promise<{ url: string } | { error: string; promo?: boolean }> {
  const { student, product } = params;
  const pass = getStudentExamPass();
  if (product === "exam" && !pass.available) return { error: "exam_unavailable" };
  const base = product === "exam" ? pass.priceRub : PRICE_RUB;
  const priced = await applyPromoToPrice(params.formData, student, base);
  if ("error" in priced) return { error: priced.error, promo: true };
  const days = product === "exam" ? pass.daysLeft : PERIOD_DAYS;
  try {
    const payment = await createYooKassaPayment({
      amountRub: priced.amountRub,
      description:
        product === "exam"
          ? `Планиметрика Pro «До ЕГЭ» — до ${pass.untilLabel}${params.byParent ? ` (для ${student.name})` : ""}`
          : `Планиметрика Pro — ${PERIOD_DAYS} дней${params.byParent ? ` (для ${student.name})` : ""}`,
      returnUrl: params.returnUrl,
      idempotenceKey: genId("idem"),
      metadata: { userId: student.id, product, ...(params.byParent ? { byParent: "1" } : {}) },
    });
    await createPendingPayment({
      userId: student.id,
      yookassaPaymentId: payment.id,
      amountRub: priced.amountRub,
      periodDays: days,
      paymentType: "student_pro",
      // для ученика tier='exam' значит «До ЕГЭ»: Pro до конца сезона
      tier: product === "exam" ? "exam" : undefined,
      promoCode: priced.promoCode,
    });
    return { url: payment.confirmationUrl };
  } catch (e) {
    console.error("Ошибка создания платежа ЮKassa:", e);
    return { error: "payment_failed" };
  }
}

function parseProduct(v: FormDataEntryValue | null | undefined): StudentProduct {
  return v === "exam" ? "exam" : "month";
}

export async function startPaymentAction(formData?: FormData) {
  const user = await getSessionUser();
  if (!user || !isStandaloneStudent(user)) {
    redirect("/student");
  }
  if (!isYooKassaConfigured()) {
    // ЮKassa не настроена — кнопка в этом случае не показывается, но на
    // всякий случай не роняем приложение, а возвращаем на страницу тарифа.
    redirect("/student/upgrade?error=payment_not_configured");
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const res = await createStudentPayment({
    student: user!,
    product: parseProduct(formData?.get("product")),
    formData,
    returnUrl: `${appUrl}/student/upgrade?paid=1`,
  });
  if ("error" in res) {
    redirect(res.promo ? `/student/upgrade?promoError=${encodeURIComponent(res.error)}` : `/student/upgrade?error=${res.error}`);
  }
  redirect((res as { url: string }).url);
}

// ---------- «Попросить родителя» ----------

/** Ссылка для взрослого: оплатить ученику Pro без своего аккаунта. */
export async function createPayRequestAction(): Promise<{ url?: string; error?: string }> {
  const user = await getSessionUser();
  if (!user || !isStandaloneStudent(user)) return { error: "Доступно ученикам без репетитора" };
  const token = await getOrCreatePayRequest(user.id);
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return { url: `${appUrl}/pay/${token}` };
}

/** Оплата по ссылке родителя: страница /pay/<token>, вход не нужен. */
export async function startParentPaymentAction(formData: FormData) {
  const token = String(formData.get("token") || "");
  const req = await getPayRequest(token);
  if (!req) redirect(`/pay/${encodeURIComponent(token)}`);
  if (!isYooKassaConfigured()) redirect(`/pay/${token}?error=payment_not_configured`);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const res = await createStudentPayment({
    student: req!.student,
    product: parseProduct(formData.get("product")),
    returnUrl: `${appUrl}/pay/${token}?paid=1`,
    byParent: true,
  });
  if ("error" in res) redirect(`/pay/${token}?error=${encodeURIComponent(res.error)}`);
  redirect((res as { url: string }).url);
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

// ---------- Платная проверка решения ----------

/**
 * Заказ проверки развёрнутого решения экспертом. Вызывается из карточки
 * задачи после самопроверки; возвращает адрес формы оплаты ЮKassa.
 */
export async function startReviewPaymentAction(attemptId: string): Promise<{ url?: string; error?: string }> {
  const user = await getSessionUser();
  if (!user || !isStandaloneStudent(user)) return { error: "Проверка доступна ученикам без репетитора" };
  if (!isPaidReviewEnabled() || !isYooKassaConfigured()) return { error: "Проверка сейчас недоступна" };
  const prep = await prepareReviewOrder(user.id, attemptId);
  if ("error" in prep) return { error: prep.error };
  const { order } = prep;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  try {
    const payment = await createYooKassaPayment({
      amountRub: order.priceRub,
      description: "Планиметрика — проверка развёрнутого решения экспертом",
      returnUrl: `${appUrl}/student/checks?paid=1`,
      idempotenceKey: genId("idem"),
      metadata: { userId: user.id, type: "review_check", orderId: order.id },
    });
    await createPendingPayment({
      userId: user.id,
      yookassaPaymentId: payment.id,
      amountRub: order.priceRub,
      periodDays: 0,
      paymentType: "review_check",
      reviewOrderId: order.id,
    });
    return { url: payment.confirmationUrl };
  } catch (e) {
    console.error("Ошибка создания платежа ЮKassa (проверка решения):", e);
    return { error: "Не удалось создать платёж. Попробуйте ещё раз через пару минут." };
  }
}
