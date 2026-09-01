import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import {
  isStandaloneStudent,
  isEffectivelyPro,
  getEffectiveEnergy,
  minutesUntilNextEnergy,
  FREE_MAX_ENERGY,
} from "@/lib/queries";
import { upgradeToProAction, downgradeToFreeAction } from "@/app/actions";
import { startPaymentAction } from "@/app/actions-payments";
import { isYooKassaConfigured } from "@/lib/yookassa";
import StudentShell from "@/components/StudentShell";
import Mascot from "@/components/Mascot";
import { IconCheck, IconCrown } from "@/components/icons";

const PRO_FEATURES = [
  "Бесконечная энергия — решай сколько угодно задач в день",
  "Все главы программы, а не только «Треугольники»",
  "Развёрнутые (DETAILED) задачи с эталонным решением для самопроверки",
  "Авторские пробники платформы",
  "Подробная аналитика по темам (в разработке)",
];

const FREE_FEATURES = [
  `${FREE_MAX_ENERGY} энергии в день (восстанавливается со временем)`,
  "Глава «Треугольники» полностью открыта",
  "Обычные задачи с подсказками и разбором",
];

export default async function UpgradePage({
  searchParams,
}: {
  searchParams: { paid?: string; error?: string };
}) {
  const user = (await getSessionUser())!;
  if (!isStandaloneStudent(user)) redirect("/student");

  const isPro = isEffectivelyPro(user);
  const energy = Math.floor(getEffectiveEnergy(user));
  const minutesLeft = minutesUntilNextEnergy(user);
  const realPayments = isYooKassaConfigured();
  const priceRub = Number(process.env.YOOKASSA_PRICE_RUB || 249);
  const periodDays = Number(process.env.YOOKASSA_PERIOD_DAYS || 30);

  return (
    <StudentShell active="profile" title="Тариф">
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

        {!isPro && (
          <div className="card mb-6 p-5 text-center">
            <p className="text-sm font-bold text-ink-soft">Текущая энергия</p>
            <p className="mt-1 font-display text-3xl font-black text-teal">
              {energy}/{FREE_MAX_ENERGY}
            </p>
            {energy < FREE_MAX_ENERGY && (
              <p className="mt-1 text-xs text-ink-soft">
                Следующая единица энергии через {minutesLeft} мин
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
              {priceRub} ₽ / {periodDays} дн.
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
            {!isPro &&
              (realPayments ? (
                <>
                  <form action={startPaymentAction} className="mt-4">
                    <button className="btn-primary w-full !bg-amber !text-xs" type="submit">
                      Оплатить через ЮKassa
                    </button>
                  </form>
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
            ? "Оплата через ЮKassa — разовый платёж за период, без автопродления."
            : "Это MVP-демонстрация: переключение тарифа мгновенное и бесплатное, реальной оплаты нет."}
        </p>
      </div>
      </div>
    </StudentShell>
  );
}
