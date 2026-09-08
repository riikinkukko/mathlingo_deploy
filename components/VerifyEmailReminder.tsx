"use client";

import { useState, useTransition } from "react";
import { resendVerificationEmailAction } from "@/app/actions";

export default function VerifyEmailReminder() {
  const [isPending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);

  return (
    <div className="mt-6 card border-2 border-amber/30 bg-amber-light/40 p-5">
      <p className="mb-1 font-display text-base font-black text-ink">Email не подтверждён</p>
      <p className="mb-3 text-sm text-ink-soft">
        Подтвердите email, чтобы точно не потерять доступ к аккаунту — мы
        отправили ссылку при регистрации, письмо могло затеряться среди
        других.
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
