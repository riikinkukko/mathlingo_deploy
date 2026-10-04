import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getStudentsOfTeacher, isTeacherEffectivelyPro } from "@/lib/queries";
import { isYooKassaConfigured } from "@/lib/yookassa";
import TeacherShell from "@/components/TeacherShell";
import Mascot from "@/components/Mascot";
import TeacherSubscriptionCard from "./TeacherSubscriptionCard";
import TeacherPlanPicker from "@/components/TeacherPlanPicker";
import { TEACHER_FREE_LIMIT, TEACHER_TIERS, teacherPlanState } from "@/lib/teacher-plan";
import { pluralRu } from "@/lib/pluralize";

function fmtDate(d: Date | null) {
  if (!d) return "—";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }) });
}
import TrackGoal from "@/components/TrackGoal";


export default async function TeacherUpgradePage({
  searchParams,
}: {
  searchParams: { paid?: string; error?: string };
}) {
  const user = (await getSessionUser())!;
  if (user.role !== "TEACHER") redirect("/login");

  const students = await getStudentsOfTeacher(user.id);
  const isPro = isTeacherEffectivelyPro(user);
  const isOwner = !!user.isPlatformOwner;
  const realPayments = isYooKassaConfigured();
  const plan = teacherPlanState(user);
  // Оплатил до появления ступеней (тариф не указан) — продлится как «Профи», дешевле.
  const legacyPayer = isPro && !user.teacherTier && !!user.yookassaPaymentMethodId;

  return (
    <TeacherShell active="upgrade" title="Тариф">
      {!isPro && <TrackGoal goal="paywall_view" />}
      <div className="px-4 py-6 lg:px-8">
        <div className="mx-auto max-w-2xl">
          <div className="mb-6 text-center">
            <Mascot mood={isPro || isOwner ? "celebrating" : "idle"} size={90} />
            <h1 className="mt-2 font-display text-2xl font-black text-ink">Тариф репетитора</h1>
          </div>

          {searchParams.paid === "1" && !isPro && (
            <div className="mb-6 rounded-2xl border-2 border-amber/30 bg-amber-light p-3.5 text-center text-sm font-bold text-amber">
              Оплата обрабатывается — обычно это занимает несколько секунд.
              Обновите страницу через минуту, если тариф ещё не активировался.
            </div>
          )}
          {searchParams.error === "payment_failed" && (
            <div className="mb-6 rounded-2xl border-2 border-coral/30 bg-coral-light p-3.5 text-center text-sm font-bold text-coral">
              Не удалось создать платёж. Попробуйте ещё раз через пару минут —
              если не поможет, напишите в поддержку.
            </div>
          )}

          {isOwner ? (
            <div className="card p-5 text-center">
              <p className="font-display text-lg font-black text-pine-dark">
                Вы — владелец платформы
              </p>
              <p className="mt-1 text-sm text-ink-soft">
                Лимит на учеников и оплата тарифа к вам не применяются вообще.
              </p>
            </div>
          ) : (
            <>
              <div className="card mb-6 p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-display text-lg font-black text-ink">
                    {plan.source === "trial"
                      ? `Пробный «Профи»: осталось ${plan.trialDaysLeft} ${pluralRu(plan.trialDaysLeft ?? 0, ["день", "дня", "дней"])}`
                      : plan.source === "paid"
                        ? `Тариф «${TEACHER_TIERS[plan.paidTier ?? "pro"].name}»`
                        : "Бесплатный тариф"}
                  </p>
                  <p className="text-sm font-bold text-ink-soft">
                    Учеников: {students.length}
                    {Number.isFinite(plan.limit) ? ` из ${plan.limit}` : ""}
                  </p>
                </div>
                <p className="mt-1 text-[13px] text-ink-soft">
                  {plan.source === "trial"
                    ? `До ${fmtDate(plan.until)} — без лимита учеников и со всеми функциями. Потом: бесплатно до ${TEACHER_FREE_LIMIT} учеников или тариф ниже. Ничего не удалится.`
                    : plan.source === "paid"
                      ? plan.until
                        ? `${user.yookassaPaymentMethodId ? "Следующее списание" : "Оплачено до"} ${fmtDate(plan.until)}${
                            user.teacherBillingPeriod ? ` · ${user.teacherBillingPeriod === "year" ? "за год" : "помесячно"}` : ""
                          }.`
                        : "Бессрочно."
                      : students.length > TEACHER_FREE_LIMIT
                        ? `У вас ${students.length} учеников — все остаются с вами, но добавить новых можно только на платном тарифе.`
                        : `Бесплатно можно вести до ${TEACHER_FREE_LIMIT} учеников со всеми функциями.`}
                </p>
                {legacyPayer && (
                  <p className="mt-3 rounded-xl bg-pine-light px-3 py-2 text-[13px] font-bold text-pine-dark">
                    Ваш тариф теперь называется «Профи» и стал дешевле: следующее списание — {TEACHER_TIERS.pro.month.toLocaleString("ru-RU")} ₽
                    вместо 1 499 ₽.
                  </p>
                )}
              </div>

              {isPro && user.yookassaPaymentMethodId && (
                <TeacherSubscriptionCard
                  cardLast4={user.yookassaCardLast4}
                  cardType={user.yookassaCardType}
                  teacherProUntil={user.teacherProUntil}
                />
              )}

              {!realPayments && (
                <p className="mb-3 text-center text-xs font-semibold text-ink-soft">Демо-режим: оплата не подключена.</p>
              )}
              <TeacherPlanPicker mode="buy" current={plan.paidTier ?? "free"} realPayments={realPayments} />

              <p className="mt-6 text-center text-xs text-ink-soft">
                Оплата через ЮKassa с автопродлением до отмены. Отменить можно самостоятельно в любой момент — карточка
                со способом оплаты появится здесь после первой оплаты. При смене тарифа неиспользованные дни
                пересчитываются в дни нового тарифа — ничего не сгорает.
              </p>
            </>
          )}
        </div>
      </div>
    </TeacherShell>
  );
}
