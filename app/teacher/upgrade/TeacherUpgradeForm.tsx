"use client";

import { useFormState, useFormStatus } from "react-dom";
import { startTeacherPaymentAction } from "@/app/actions-payments";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary w-full !bg-amber !text-xs" type="submit" disabled={pending}>
      {pending ? "Переходим к оплате…" : "Оформить и оплатить"}
    </button>
  );
}

export default function TeacherUpgradeForm({ priceRub, periodDays }: { priceRub: number; periodDays: number }) {
  const [state, formAction] = useFormState<{ error?: string }, FormData>(startTeacherPaymentAction, {});

  return (
    <form action={formAction} className="mt-4">
      <label className="mb-3 flex items-start gap-2.5 text-[11px] leading-snug text-ink-soft">
        <input type="checkbox" name="recurringConsent" required className="mt-0.5 h-4 w-4 shrink-0 accent-pine" />
        <span>
          Я соглашаюсь на автоматическое списание {priceRub} ₽ каждые {periodDays} дней
          до момента отмены подписки. Отменить автопродление можно в любой
          момент в разделе «Тариф». Подробнее — в{" "}
          <a href="/legal/offer" target="_blank" className="font-bold text-pine hover:underline">
            Публичной оферте
          </a>
          .
        </span>
      </label>
      {state?.error && (
        <p className="mb-3 rounded-lg bg-coral-light px-3 py-2 text-xs text-coral">{state.error}</p>
      )}
      <SubmitButton />
    </form>
  );
}
