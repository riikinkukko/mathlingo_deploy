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

export default async function UpgradePage(
  props: {
    searchParams: Promise<{ paid?: string; error?: string; promo?: string; promoError?: string; promoOk?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const user = (await getSessionUser())!;
  if (!isStandaloneStudent(user)) redirect("/student");

  const isPro = isEffectivelyPro(user);
  const energy = Math.floor(getEffectiveEnergy(user));
  const minutesLeft = minutesUntilNextEnergy(user);
  const rechargeBlocked = isEnergyRechargeBlocked(user);
  const realPayments = isYooKassaConfigured();
  const { priceRub } = getStudentProPrice();

  const promoRaw = searchParams.promo ?? (await cookies()).get(PROMO_COOKIE)?.value;
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
  // Месяцы до экзамена — для «≈ N ₽/мес» у разового «До ЕГЭ» (с учётом промокода).
  const passMonths = Math.max(1, Math.round(pass.daysLeft / 30));
  const passPerMonth = Math.round(passPrice / passMonths);
  const proUntilLabel = user.proUntil
    ? new Date(user.proUntil).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <StudentShell active="profile" title="Тариф">
      {!isPro && <TrackGoal goal="paywall_view" />}
      <div className="px-4 py-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        {/* Раньше страница открывалась грустным маскотом и «Твой тариф» —
            теперь сразу о том, что даёт Pro (а у Pro — до какого числа он действует). */}
        <div className="mb-6 flex items-center gap-3 sm:justify-center">
          <Mascot mood={isPro ? "celebrating" : "happy"} size={72} float={false} className="shrink-0" />
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-black leading-tight text-ink">
              {isPro ? "Твой тариф: Pro" : "Pro — без лимита энергии"}
            </h1>
            <p className="mt-0.5 text-[14px] font-semibold text-ink-soft">
              {isPro
                ? proUntilLabel
                  ? `Действует до ${proUntilLabel}`
                  : "Все главы и безлимитная энергия"
                : "Все главы, задачи второй части и пробники"}
            </p>
          </div>
        </div>

        {searchParams.paid === "1" && !isPro && (
          <div className="mb-6 rounded-2xl border-2 border-amber/30 bg-amber-light p-3.5 text-center text-sm font-bold text-amber-text">
            Оплата обрабатывается — обычно это занимает несколько секунд.
            Обнови страницу через минуту, если Pro ещё не появился.
          </div>
        )}
        {searchParams.error === "payment_failed" && (
          <div className="mb-6 rounded-2xl border-2 border-coral/30 bg-coral-light p-3.5 text-center text-sm font-bold text-coral">
            Не удалось создать платёж. Попробуй ещё раз через пару минут —
            если не поможет, напиши в поддержку.
          </div>
        )}

        {(!isPro || promoSuccess) && realPayments && <PromoBox active={activePromo} error={promoError} success={promoSuccess} />}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className={`card p-5 ${isPro ? "border-2 !border-amber" : ""} bg-gradient-to-br from-amber-light to-white`}>
            <p className="mb-1 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-amber-text">
              <IconCrown className="h-4 w-4" />
              Pro{isPro && " · сейчас у тебя"}
            </p>
            {/* Цена — ровно та, что на кнопках ниже (раньше «от 132 ₽ в месяц»
                рядом с кнопками 1 190 ₽ и 249 ₽ ничем не объяснялось). */}
            <div className="mb-3">
              {pass.available ? (
                <>
                  <p className="font-display text-xl font-black leading-tight text-ink">
                    {passPrice.toLocaleString("ru-RU")} ₽ до экзамена
                  </p>
                  <p className="mt-0.5 text-[13px] font-bold text-ink-soft">
                    ≈ {passPerMonth} ₽/мес · или {payPrice.toLocaleString("ru-RU")} ₽ за 30 дней
                  </p>
                </>
              ) : (
                <p className="font-display text-xl font-black text-ink">{payPrice.toLocaleString("ru-RU")} ₽ за 30 дней</p>
              )}
              {!realPayments && <p className="mt-0.5 text-xs font-semibold text-ink-soft">(демо-режим оплаты)</p>}
            </div>
            <ul className="space-y-2 text-sm text-ink-soft">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-text" />
                  {f}
                </li>
              ))}
            </ul>
            {!isPro &&
              (realPayments ? (
                <>
                  {pass.available && (
                    <form action={startPaymentAction} className="mt-4">
                      <input type="hidden" name="product" value="exam" />
                      {activePromo && <input type="hidden" name="promo" value={activePromo.code} />}
                      <PayButton className="btn-primary w-full !h-12 !bg-pine-dark !text-[13px]">
                        «До ЕГЭ» — {passPrice.toLocaleString("ru-RU")} ₽
                        {pass.regularPriceRub && !activePromo && (
                          <s className="opacity-70">{pass.regularPriceRub.toLocaleString("ru-RU")} ₽</s>
                        )}
                      </PayButton>
                      <p className="mt-1.5 text-center text-[12px] font-semibold text-ink-soft">
                        Разовый платёж · Pro до {pass.untilLabel}
                        {pass.earlyUntilLabel ? ` · ранняя цена до ${pass.earlyUntilLabel}` : ""}
                      </p>
                    </form>
                  )}
                  <form action={startPaymentAction} className="mt-2">
                    <input type="hidden" name="product" value="month" />
                    {activePromo && <input type="hidden" name="promo" value={activePromo.code} />}
                    <PayButton className="btn-secondary w-full !h-12 !text-[13px]">
                      30 дней — {payPrice.toLocaleString("ru-RU")} ₽
                    </PayButton>
                  </form>
                  <AskParentButton className="mt-3" />
                  <p className="mt-2 text-center text-[11px] leading-snug text-ink-soft">
                    Нажимая кнопку оплаты, ты принимаешь условия{" "}
                    <a href="/legal/offer" target="_blank" className="font-bold text-pine-dark hover:underline">
                      Публичной оферты
                    </a>
                    .
                  </p>
                </>
              ) : (
                <form action={upgradeToProAction} className="mt-4">
                  <button className="btn-primary w-full !h-12 !bg-pine-dark !text-[13px]" type="submit">
                    Перейти на Pro (демо)
                  </button>
                </form>
              ))}
          </div>
          <div className="card p-5">
            <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-ink-soft">Free{!isPro && " · сейчас у тебя"}</p>
            <p className="mb-3 font-display text-xl font-black text-ink">0 ₽</p>
            <ul className="space-y-2 text-sm text-ink-soft">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-ink-soft" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {!isPro && (
          <div className="card mt-4 p-5 text-center">
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
              <p className="mt-2 text-xs font-bold text-amber-text">
                Энергия не восстанавливается, пока не подтверждён email.{" "}
                <a href="/student/profile" className="underline">
                  Подтвердить
                </a>
              </p>
            )}
          </div>
        )}

        {/* Понижение тарифа — не главная кнопка страницы, а скромная ссылка внизу. */}
        {isPro && (
          <form action={downgradeToFreeAction} className="mt-6 text-center">
            <button
              type="submit"
              className="text-[13px] font-bold text-ink-soft underline underline-offset-2 hover:text-coral-text"
            >
              Вернуться на Free
            </button>
          </form>
        )}

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
