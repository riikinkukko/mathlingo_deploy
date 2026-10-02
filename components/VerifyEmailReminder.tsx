"use client";

import { useState, useTransition } from "react";
import { resendVerificationEmailAction } from "@/app/actions";

/** reason — что именно не работает без подтверждения (энергия, добавление
 * учеников). Без него показывается общий текст. */
export default function VerifyEmailReminder({ reason, compact = false }: { reason?: string; compact?: boolean } = {}) {
  const [isPending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);

  // Компактная полоска — для главной репетитора, где большая карточка
  // занимала полэкрана над самым важным (занятиями дня).
  if (compact) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-amber-light px-4 py-2.5 text-[13px] font-bold text-amber-dark">
        <span className="min-w-0 flex-1">
          {sent ? "Письмо отправлено — проверьте почту и «Спам»" : reason ?? "Подтвердите email, чтобы не потерять доступ"}
        </span>
        {!sent && (
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                await resendVerificationEmailAction();
                setSent(true);
              })
            }
            className="min-h-[36px] shrink-0 rounded-xl bg-white px-3 text-[13px] font-extrabold text-amber-dark"
          >
            {isPending ? "…" : "Отправить"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-6 card border-2 border-amber/30 bg-amber-light/40 p-5">
      <p className="mb-1 font-display text-base font-black text-ink">Email не подтверждён</p>
      <p className="mb-3 text-sm text-ink-soft">
        {reason ??
          "Подтвердите email, чтобы точно не потерять доступ к аккаунту."}{" "}
        Ссылку мы отправили при регистрации — письмо могло затеряться среди
        других или попасть в «Спам».
      </p>
      {sent ? (
        <p className="text-xs font-bold text-pine-dark">Письмо отправлено ещё раз — проверьте почту.</p>
      ) : (
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(async () => {
            await resendVerificationEmailAction();
            setSent(true);
          })}
          className="btn-secondary !text-xs disabled:opacity-50"
        >
          {isPending ? "Отправляем…" : "Отправить письмо ещё раз"}
        </button>
      )}
    </div>
  );
}
