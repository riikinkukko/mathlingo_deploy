"use client";

import { useState, useTransition } from "react";
import { cancelTeacherAutoRenewalAction } from "@/app/actions";

/**
 * Требование ЮKassa при согласовании автоплатежей: должен быть интерфейс,
 * где пользователь может самостоятельно отвязать карту, без обращения в
 * поддержку. Полноценное модальное окно (не просто window.confirm) —
 * специально по образцу референса, который прислала ЮKassa при проверке.
 */
export default function TeacherSubscriptionCard({
  cardLast4,
  cardType,
  teacherProUntil,
}: {
  cardLast4?: string;
  cardType?: string;
  teacherProUntil?: string;
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();

  const nextChargeDate = teacherProUntil
    ? new Date(teacherProUntil).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })
    : "—";

  return (
    <div className="card mb-6 p-5">
      <p className="mb-3 font-display text-base font-black text-ink">Информация о подписке</p>
      <div className="space-y-2.5 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-ink-soft">Способ оплаты</span>
          <span className="font-semibold text-ink">
            {cardLast4 ? `${cardType || "Карта"} •••• ${cardLast4}` : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-ink-soft">Дата следующего списания</span>
          <span className="font-semibold text-ink">{nextChargeDate}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        className="btn-secondary mt-4 w-full !text-xs !text-coral"
      >
        Отменить подписку
      </button>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5">
            <p className="mb-1 font-display text-lg font-black text-ink">Отмена подписки</p>
            <p className="mb-4 text-sm text-ink-soft">Уверены, что хотите отменить подписку?</p>

            <div className="mb-3 rounded-xl bg-paper p-3 text-sm">
              <span className="text-ink-soft">Способ оплаты: </span>
              <span className="font-semibold text-ink">
                {cardLast4 ? `${cardType || "Карта"} •••• ${cardLast4}` : "—"}
              </span>
            </div>
            <div className="mb-4 rounded-xl bg-amber-light p-3 text-xs text-amber-dark">
              После отмены доступ к тарифу сохранится до окончания уже
              оплаченного периода — {nextChargeDate}. Новое списание не
              произойдёт.
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  startTransition(async () => {
                    await cancelTeacherAutoRenewalAction();
                    setShowConfirm(false);
                  });
                }}
                className="flex-1 rounded-pill bg-coral px-4 py-2.5 text-sm font-extrabold text-white transition hover:brightness-95 disabled:opacity-50"
              >
                {isPending ? "Отменяем…" : "Отменить подписку"}
              </button>
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="flex-1 rounded-pill border-2 border-line px-4 py-2.5 text-sm font-extrabold text-ink-soft transition hover:border-pine hover:text-pine"
              >
                Назад
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
