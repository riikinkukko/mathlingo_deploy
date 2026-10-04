import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import {
  isStandaloneStudent,
  isEffectivelyPro,
  getEffectiveEnergy,
  minutesUntilNextEnergy,
  isEnergyRechargeBlocked,
  FREE_MAX_ENERGY,
} from "@/lib/queries";
import { upgradeToProAction, downgradeToFreeAction } from "@/app/actions";
import { startPaymentAction } from "@/app/actions-payments";
import { isYooKassaConfigured } from "@/lib/yookassa";
import { getStudentExamPass, getStudentProPrice, STUDENT_FREE_FEATURES, STUDENT_PRO_FEATURES } from "@/lib/tariffs";
import AskParentButton from "@/components/AskParentButton";
import StudentShell from "@/components/StudentShell";
import Mascot from "@/components/Mascot";
import { IconCheck, IconCrown } from "@/components/icons";
import TrackGoal from "@/components/TrackGoal";
import PayButton from "@/components/PayButton";
import PromoBox from "@/components/PromoBox";
import { cookies } from "next/headers";
import { checkPromo, discountedPrice, promoLabel, PROMO_COOKIE } from "@/lib/promo";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const PRO_FEATURES = STUDENT_PRO_FEATURES;
const FREE_FEATURES = STUDENT_FREE_FEATURES;

export default async function UpgradePage({
  searchParams,
}: {
  searchParams: { paid?: string; error?: string; promo?: string; promoError?: string; promoOk?: string };
}) {
  const user = (await getSessionUser())!;
  if (!isStandaloneStudent(user)) redirect("/student");

  const isPro = isEffectivelyPro(user);
  const energy = Math.floor(getEffectiveEnergy(user));
  const minutesLeft = minutesUntilNextEnergy(user);
  const rechargeBlocked = isEnergyRechargeBlocked(user);
  const realPayments = isYooKassaConfigured();
  const { priceRub } = getStudentProPrice();

  const promoRaw = searchParams.promo ?? cookies().get(PROMO_COOKIE)?.value;
  let promoError = searchParams.promoError ?? null;
  let activePromo: { code: string; percent: number; label: string } | null = null;
  if (promoRaw && !isPro) {
    const check = await checkPromo(promoRaw, user);
    if (check.ok && check.promo.kind === "percent") activePromo = { code: check.promo.code, percent: check.promo.value, label: check.label };
    else if (!check.ok && searchParams.promo) promoError = check.error;
  }
  let promoSuccess: string | null = null;
  if (searchParams.promoOk) {
    const [p] = await db.select().from(schema.promoCodes).where(eq(schema.promoCodes.code, searchParams.promoOk.toUpperCase())).limit(1);
    if (p) promoSuccess = `Промокод ${p.code} применён: ${promoLabel(p)}.`;
  }
  const payPrice = activePromo ? discountedPrice(priceRub, activePromo.percent) : priceRub;
  const pass = getStudentExamPass();
  const passPrice = activePromo ? discountedPrice(pass.priceRub, activePromo.percent) : pass.priceRub;
  const proUntilLabel = user.proUntil
    ? new Date(user.proUntil).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <StudentShell active="profile" title="Тариф">
      {!isPro && <TrackGoal goal="paywall_view" />}
      <div className="px-4 py-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 text-center">
          <Mascot mood={isPro ? "celebrating" : energy === 0 ? "worried" : "idle"} size={90} />
          <h1 className="mt-2 font-display text-2xl font-black text-ink">Твой тариф</h1>
        </div>

        {searchParams.paid === "1" && !isPro && (
          <div className="mb-6 rounded-2xl border-2 border-amber/30 bg-amber-light p-3.5 text-center text-sm font-bold text-amber">
            Оплата обрабатывается — обычно это занимает несколько секунд.
            Обновите страницу через минуту, если Pro ещё не появился.
          </div>
        )}
        {searchParams.error === "payment_failed" && (
          <div className="mb-6 rounded-2xl border-2 border-coral/30 bg-coral-light p-3.5 text-center text-sm font-bold text-coral">
            Не удалось создать платёж. Попробуйте ещё раз через пару минут —
            если не поможет, напишите в поддержку.
          </div>
        )}

        {(!isPro || promoSuccess) && realPayments && <PromoBox active={activePromo} error={promoError} success={promoSuccess} />}

        {!isPro && (
          <div className="card mb-6 p-5 text-center">
            <p className="text-sm font-bold text-ink-soft">Текущая энергия</p>
            <p className="mt-1 font-display text-3xl font-black text-teal">
              {energy}/{FREE_MAX_ENERGY}
            </p>
            {energy < FREE_MAX_ENERGY && !rechargeBlocked && (
              <p className="mt-1 text-xs text-ink-soft">
                Следующая единица энергии через {minutesLeft} мин
              </p>
            )}
            {rechargeBlocked && (
              <p className="mt-2 text-xs font-bold text-amber">
                Энергия не восстанавливается, пока не подтверждён email.{" "}
                <a href="/student/profile" className="underline">
                  Подтвердить
                </a>
              </p>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className={`card p-5 ${!isPro ? "border-2 !border-pine" : ""}`}>
            <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-ink-soft">Free</p>
            <p className="mb-3 font-display text-xl font-black text-ink">0 ₽</p>
            <ul className="space-y-2 text-sm text-ink-soft">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-ink-soft" />
                  {f}
                </li>
              ))}
            </ul>
            {isPro && (
              <form action={downgradeToFreeAction} className="mt-4">
                <button className="btn-secondary w-full !text-xs" type="submit">
                  Вернуться на Free
                </button>
              </form>
            )}
          </div>

          <div className={`card p-5 ${isPro ? "border-2 !border-amber" : ""} bg-gradient-to-br from-amber-light to-white`}>
            <p className="mb-1 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-amber">
              <IconCrown className="h-4 w-4" />
              Pro
            </p>
            <p className="mb-3 font-display text-xl font-black text-ink">
              от {pass.available ? Math.min(pass.perMonth, payPrice) : payPrice} ₽ в месяц
              {!realPayments && <span className="ml-1 text-xs font-semibold text-ink-soft">(демо-режим оплаты)</span>}
            </p>
            <ul className="space-y-2 text-sm text-ink-soft">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
                  {f}
                </li>
              ))}
            </ul>
            {isPro && proUntilLabel && (
              <p className="mt-4 rounded-xl bg-white/70 px-3 py-2 text-[13px] font-bold text-ink">Pro действует до {proUntilLabel}</p>
            )}
            {!isPro &&
              (realPayments ? (
                <>
                  {pass.available && (
                    <form action={startPaymentAction} className="mt-4">
                      <input type="hidden" name="product" value="exam" />
                      {activePromo && <input type="hidden" name="promo" value={activePromo.code} />}
                      <PayButton className="btn-primary w-full !h-auto !flex-col !gap-0.5 !bg-amber !py-3 !text-xs">
                        <span className="block">«До ЕГЭ» — {passPrice.toLocaleString("ru-RU")} ₽ разово</span>
                        <span className="block text-[11px] font-bold normal-case tracking-normal opacity-90">
                          Pro до {pass.untilLabel} · около {pass.perMonth} ₽ в месяц
                        </span>
                      </PayButton>
                    </form>
                  )}
                  <form action={startPaymentAction} className="mt-2">
                    <input type="hidden" name="product" value="month" />
                    {activePromo && <input type="hidden" name="promo" value={activePromo.code} />}
                    <PayButton className="btn-secondary w-full !text-xs">
                      Месяц — {payPrice} ₽
                    </PayButton>
                  </form>
                  <AskParentButton className="mt-3" />
                  <p className="mt-2 text-center text-[11px] leading-snug text-ink-soft">
                    Нажимая «Оплатить», вы принимаете условия{" "}
                    <a href="/legal/offer" target="_blank" className="font-bold text-pine hover:underline">
                      Публичной оферты
                    </a>
                    .
                  </p>
                </>
              ) : (
                <form action={upgradeToProAction} className="mt-4">
                  <button className="btn-primary w-full !bg-amber !text-xs" type="submit">
                    Перейти на Pro (демо)
                  </button>
                </form>
              ))}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-ink-soft">
          {realPayments
            ? "Оплата через ЮKassa — разовый платёж за период, без автопродления. Если платит родитель — нажми «Попросить родителя» и отправь ему ссылку."
            : "Это MVP-демонстрация: переключение тарифа мгновенное и бесплатное, реальной оплаты нет."}
        </p>
      </div>
      </div>
    </StudentShell>
  );
}
