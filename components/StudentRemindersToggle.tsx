"use client";

import { useRef } from "react";
import { useFormState } from "react-dom";
import { setStudentRemindersAction, TgPrefsState } from "@/app/actions-telegram";

/** Переключатель вечерних напоминаний в профиле ученика. */
export default function StudentRemindersToggle({ enabled }: { enabled: boolean }) {
  const [state, action] = useFormState<TgPrefsState, FormData>(setStudentRemindersAction, null);
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
            Вечернее напоминание
            {state?.ok && <span className="ml-2 text-pine-dark">✓</span>}
          </span>
          <span className="block text-xs text-ink-soft">
            В 19:00, если ты ещё не занимался(ась) сегодня, а серия может прерваться или завтра срок домашки.
          </span>
        </span>
      </label>
    </form>
  );
}
