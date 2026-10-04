"use client";

import { useState } from "react";
import { startReviewPaymentAction } from "@/app/actions-payments";
import { ymGoal } from "@/lib/ym";

/**
 * После самопроверки развёрнутого решения: предложить проверку экспертом —
 * как на ЕГЭ, с пометками на фото и комментарием.
 */
export default function PaidReviewOffer({ attemptId, priceRub }: { attemptId: string; priceRub: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function order() {
    setBusy(true);
    setError(null);
    ymGoal("paid_review_started");
    const res = await startReviewPaymentAction(attemptId);
    if (res.url) {
      window.location.href = res.url;
      return;
    }
    setError(res.error ?? "Не получилось");
    setBusy(false);
  }

  return (
    <div className="mt-3 rounded-2xl border-2 border-violet/30 bg-violet-light/60 p-3.5">
      <p className="text-[14px] font-black text-ink">Не уверен, что засчитают на ЕГЭ?</p>
      <p className="mt-1 text-[13px] leading-snug text-ink-soft">
        Эксперт проверит решение по критериям ЕГЭ, отметит ошибки прямо на фото и напишет, что исправить. Ответ — в течение 2 дней.
      </p>
      <button
        type="button"
        onClick={order}
        disabled={busy}
        className="mt-3 h-11 rounded-xl bg-violet px-4 text-[14px] font-black text-white transition hover:brightness-105 disabled:opacity-60"
      >
        {busy ? "Переходим к оплате…" : `Отправить на проверку — ${priceRub} ₽`}
      </button>
      {error && <p className="mt-2 text-[12px] font-bold text-coral">{error}</p>}
    </div>
  );
}
