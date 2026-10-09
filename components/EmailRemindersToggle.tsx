"use client";

import { useRef } from "react";
import { useFormState } from "react-dom";
import { setEmailRemindersAction, TgPrefsState } from "@/app/actions-telegram";

/** Переключатель писем «возвращайся» в профиле самостоятельного ученика. */
export default function EmailRemindersToggle({ enabled }: { enabled: boolean }) {
  const [state, action] = useFormState<TgPrefsState, FormData>(setEmailRemindersAction, null);
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={action} className="mt-3 rounded-2xl bg-pine-light/50 p-3">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          name="reminders"
          defaultChecked={enabled}
          onChange={() => form.current?.requestSubmit()}
          className="mt-0.5 h-4 w-4 shrink-0 accent-pine"
        />
        <span>
          <span className="block text-sm font-bold text-ink">
            Письма-напоминания на почту
            {state?.ok && <span className="ml-2 text-pine-dark">✓</span>}
          </span>
          <span className="block text-xs text-ink-soft">
            Если ты давно не заходил(а): через день, через 3 дня и через неделю — не больше трёх писем подряд.
            С подключённым Telegram письма не приходят.
          </span>
        </span>
      </label>
    </form>
  );
}
