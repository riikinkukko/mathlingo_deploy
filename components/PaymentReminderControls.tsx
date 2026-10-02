"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  setPaymentRemindersAction,
  sendPaymentReminderNowAction,
  savePaymentInstructionsAction,
  ReminderState,
} from "@/app/actions-student-payments";

function useFlash(state: ReminderState) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!state?.ok) return;
    setShow(true);
    const t = setTimeout(() => setShow(false), 3000);
    return () => clearTimeout(t);
  }, [state]);
  return show;
}

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-secondary">
      {pending ? "Отправляем…" : "🔔 Напомнить об оплате сейчас"}
    </button>
  );
}

/**
 * Блок в разделе «Оплаты» у ученика: автонапоминания родителям (вкл/выкл)
 * и кнопка ручного напоминания. recipientsLabel — кому уйдёт сообщение.
 */
export function PaymentReminderControls({
  studentId,
  enabled,
  recipientsLabel,
  hasInstructions,
}: {
  studentId: string;
  enabled: boolean;
  recipientsLabel: string;
  hasInstructions: boolean;
}) {
  const [toggleState, toggleAction] = useFormState<ReminderState, FormData>(setPaymentRemindersAction, null);
  const [sendState, sendAction] = useFormState<ReminderState, FormData>(sendPaymentReminderNowAction, null);
  const toggled = useFlash(toggleState);
  const sent = useFlash(sendState);
  const toggleForm = useRef<HTMLFormElement>(null);

  return (
    <div className="card mb-4 space-y-3 p-4">
      <form ref={toggleForm} action={toggleAction}>
        <input type="hidden" name="studentId" value={studentId} />
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={enabled}
            onChange={() => toggleForm.current?.requestSubmit()}
            className="mt-0.5 h-4 w-4 accent-pine"
          />
          <span>
            <span className="block text-sm font-bold text-ink">
              Напоминать об оплате автоматически
              {toggled && <span className="ml-2 font-bold text-pine">✓</span>}
            </span>
            <span className="block text-xs text-ink-soft">
              После отметки «Было»: когда осталось одно оплаченное занятие, когда они закончились и
              когда появился долг. Получит: {recipientsLabel}. Сообщение — в приложении и в Telegram.
              Включайте, если ведёте оплаты этого ученика здесь, — иначе баланс неточный.
            </span>
          </span>
        </label>
        {toggleState?.error && <p className="mt-1 text-sm font-semibold text-coral">{toggleState.error}</p>}
      </form>

      <form
        action={sendAction}
        className="flex flex-wrap items-center gap-3 border-t border-line-soft pt-3"
        onSubmit={(e) => {
          if (!window.confirm(`Отправить напоминание об оплате? Получит: ${recipientsLabel}.`)) e.preventDefault();
        }}
      >
        <input type="hidden" name="studentId" value={studentId} />
        <SendButton />
        {sent && (
          <span className="text-sm font-bold text-pine">
            ✓ Отправлено{sendState?.sent && sendState.sent > 1 ? ` (${sendState.sent})` : ""}
          </span>
        )}
        {sendState?.error && <span className="text-sm font-semibold text-coral">{sendState.error}</span>}
        {!hasInstructions && (
          <a href="/teacher/payments#how-to-pay" className="w-full text-xs text-ink-soft underline hover:text-ink">
            Добавьте «Как оплатить» на странице «Оплаты» — реквизиты попадут в напоминания
          </a>
        )}
      </form>
    </div>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? "Сохраняем…" : "Сохранить"}
    </button>
  );
}

/** «Как оплатить» на странице «Оплаты»: реквизиты, которые видят родители. */
export function PaymentInstructionsForm({ value }: { value?: string }) {
  const [state, action] = useFormState<ReminderState, FormData>(savePaymentInstructionsAction, null);
  const saved = useFlash(state);
  return (
    <form id="how-to-pay" action={action} className="card mb-6 scroll-mt-20 space-y-3 p-4">
      <div>
        <label className="label" htmlFor="paymentInstructions">Как оплатить (видят родители)</label>
        <input
          className="input"
          id="paymentInstructions"
          name="paymentInstructions"
          maxLength={300}
          defaultValue={value ?? ""}
          placeholder="Например: перевод по СБП на +7 900 000-00-00 (Т-Банк), Иван И."
        />
        <p className="mt-1 text-[11px] text-ink-soft">
          Добавляется в напоминания об оплате и показывается родителям в кабинете. Лучше номер телефона
          для СБП, чем номер карты.
        </p>
      </div>
      {state?.error && <p className="text-sm font-semibold text-coral">{state.error}</p>}
      <div className="flex items-center gap-3">
        <SaveButton />
        {saved && <span className="text-sm font-bold text-pine">✓ Сохранено</span>}
      </div>
    </form>
  );
}
