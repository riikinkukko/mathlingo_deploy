"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { startTeacherPaymentAction } from "@/app/actions-payments";
import { TEACHER_FREE_LIMIT, TEACHER_TIERS, TEACHER_TRIAL_DAYS, type BillingPeriod, type TeacherTier } from "@/lib/teacher-plan";
import { ymGoal } from "@/lib/ym";

const rub = (n: number) => `${n.toLocaleString("ru-RU")} ₽`;

const COMMON = "Расписание, оплаты, группы, домашки, проверка с разметкой, Telegram-бот";

function PayButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={() => ymGoal("payment_started")}
      className="h-12 w-full rounded-2xl bg-pine text-[15px] font-black text-white shadow-[0_3px_0_#0E5E3A] transition hover:bg-pine-dark disabled:opacity-60"
    >
      {pending ? "Переходим к оплате…" : label}
    </button>
  );
}

export interface PickerPromo {
  code: string;
  percent: number;
}

/** Цена первой оплаты со скидкой (как на сервере: целые рубли, не меньше 1). */
function firstPrice(price: number, promo?: PickerPromo | null) {
  return promo ? Math.max(1, Math.round((price * (100 - promo.percent)) / 100)) : price;
}

function BuyForm({ tier, period, promo }: { tier: TeacherTier; period: BillingPeriod; promo?: PickerPromo | null }) {
  const [state, action] = useFormState<{ error?: string }, FormData>(startTeacherPaymentAction, {});
  const price = TEACHER_TIERS[tier][period];
  const first = firstPrice(price, promo);
  return (
    <form action={action} className="mt-4 space-y-3">
      <input type="hidden" name="tier" value={tier} />
      <input type="hidden" name="period" value={period} />
      {promo && <input type="hidden" name="promo" value={promo.code} />}
      <label className="flex items-start gap-2.5 text-[11px] leading-snug text-ink-soft">
        <input type="checkbox" name="recurringConsent" required className="mt-0.5 h-4 w-4 shrink-0 accent-pine" />
        <span>
          {first !== price && <>Первое списание — {rub(first)} (скидка по промокоду). </>}
          Я соглашаюсь на автоматическое списание {rub(price)} {period === "year" ? "раз в год (каждые 365 дней)" : "каждые 30 дней"} до
          отмены подписки. Отменить можно в любой момент в разделе «Тариф». Подробнее — в{" "}
          <a href="/legal/offer" target="_blank" className="font-bold text-pine hover:underline">
            Публичной оферте
          </a>
          .
        </span>
      </label>
      {state?.error && <p className="rounded-lg bg-coral-light px-3 py-2 text-xs text-coral">{state.error}</p>}
      <PayButton label={`Оплатить ${rub(first)}`} />
    </form>
  );
}

/**
 * Три тарифа репетитора с переключателем «месяц / год». mode="public" —
 * витрина (страница тарифов), mode="buy" — оформление в кабинете.
 */
export default function TeacherPlanPicker({
  mode,
  current = "free",
  realPayments = true,
  promo = null,
}: {
  mode: "public" | "buy";
  /** код-скидка на первую оплату (только в кабинете) */
  promo?: PickerPromo | null;
  /** что действует сейчас (для подсветки) */
  current?: "free" | TeacherTier;
  realPayments?: boolean;
}) {
  const [period, setPeriod] = useState<BillingPeriod>("month");
  const [chosen, setChosen] = useState<TeacherTier | null>(null);

  const cards: { key: "free" | TeacherTier; title: string; limit: string; price: string; was?: string; sub: string; accent?: boolean }[] = [
    { key: "free", title: "Бесплатно", limit: `до ${TEACHER_FREE_LIMIT} учеников`, price: "0 ₽", sub: "навсегда" },
    ...(["standard", "pro"] as TeacherTier[]).map((t) => {
      const cfg = TEACHER_TIERS[t];
      const discounted = mode === "buy" && promo ? firstPrice(cfg[period], promo) : cfg[period];
      return {
        key: t,
        title: cfg.name,
        limit: cfg.blurb,
        price: rub(discounted),
        was: discounted !== cfg[period] ? rub(cfg[period]) : undefined,
        sub:
          discounted !== cfg[period]
            ? `первая оплата, дальше ${rub(cfg[period])} ${period === "year" ? "в год" : "в месяц"}`
            : period === "year"
              ? `в год · ${rub(Math.round(cfg.year / 12))} в месяц`
              : "в месяц",
        accent: t === "standard",
      };
    }),
  ];

  return (
    <div>
      <div className="mb-4 flex justify-center">
        <div role="radiogroup" aria-label="Период оплаты" className="flex rounded-2xl bg-line-soft p-1">
          {(
            [
              ["month", "Помесячно"],
              ["year", "За год −2 месяца"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={period === v}
              onClick={() => setPeriod(v)}
              className={`h-10 rounded-xl px-4 text-[14px] ${period === v ? "bg-white font-black text-ink shadow-soft" : "font-bold text-ink-soft"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map((c) => {
          const isCurrent = mode === "buy" && current === c.key;
          const selectable = mode === "buy" && c.key !== "free" && realPayments;
          const isChosen = chosen === c.key;
          return (
            <div
              key={c.key}
              className={`relative flex flex-col rounded-[20px] border-2 bg-white p-4 ${
                isChosen ? "border-pine" : c.accent ? "border-pine/40" : "border-line-soft"
              }`}
            >
              {c.accent && (
                <span className="absolute -top-2.5 left-4 rounded-pill bg-pine px-2.5 py-0.5 text-[11px] font-black text-white">
                  Популярный
                </span>
              )}
              <p className="text-[12px] font-black uppercase tracking-wide text-ink-soft">{c.title}</p>
              <p className="mt-1 font-display text-[26px] font-black leading-none text-ink">
                {c.price}
                {c.was && <s className="ml-2 text-[15px] font-bold text-ink-soft">{c.was}</s>}
              </p>
              <p className="mt-1 text-[12px] text-ink-soft">{c.sub}</p>
              <p className="mt-3 text-[15px] font-extrabold text-ink">{c.limit}</p>
              <p className="mt-1 text-[12px] leading-snug text-ink-soft">{COMMON}</p>
              <div className="mt-auto pt-4">
                {isCurrent ? (
                  <p className="rounded-xl bg-pine-light px-3 py-2 text-center text-[13px] font-black text-pine-dark">Ваш тариф</p>
                ) : selectable ? (
                  <button
                    type="button"
                    onClick={() => setChosen(c.key as TeacherTier)}
                    aria-pressed={isChosen}
                    className={`h-11 w-full rounded-xl text-[14px] font-black ${
                      isChosen ? "bg-pine text-white" : "border-2 border-pine text-pine-dark"
                    }`}
                  >
                    {isChosen ? "Выбран" : "Выбрать"}
                  </button>
                ) : mode === "public" && c.key !== "free" ? (
                  <a
                    href="/register/teacher"
                    className="flex h-11 items-center justify-center rounded-xl border-2 border-pine text-[14px] font-black text-pine-dark"
                  >
                    {TEACHER_TRIAL_DAYS} дней бесплатно
                  </a>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {mode === "buy" && chosen && (
        <div className="mx-auto mt-4 max-w-md rounded-[20px] border border-line-soft bg-white p-4">
          <p className="font-display text-[16px] font-black text-ink">
            «{TEACHER_TIERS[chosen].name}», {period === "year" ? "год" : "месяц"} — {rub(firstPrice(TEACHER_TIERS[chosen][period], promo))}
          </p>
          <BuyForm key={`${chosen}-${period}`} tier={chosen} period={period} promo={promo} />
        </div>
      )}
    </div>
  );
}
