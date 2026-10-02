"use client";

import { useRef } from "react";
import { useFormState } from "react-dom";
import { setParentWeeklyReportAction, TgPrefsState } from "@/app/actions-telegram";

/** Переключатель «Недельный отчёт по воскресеньям» на странице родителя. */
export default function ParentWeeklyToggle({ enabled }: { enabled: boolean }) {
  const [state, action] = useFormState<TgPrefsState, FormData>(setParentWeeklyReportAction, null);
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={action} className="mt-3 rounded-2xl bg-pine-light/50 p-3">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          name="weekly"
          defaultChecked={enabled}
          onChange={() => form.current?.requestSubmit()}
          className="mt-0.5 h-4 w-4 shrink-0 accent-pine"
        />
        <span>
          <span className="block text-sm font-bold text-ink">
            Недельный отчёт по воскресеньям
            {state?.ok && <span className="ml-2 text-pine-dark">✓</span>}
          </span>
          <span className="block text-xs text-ink-soft">
            Дни занятий, задачи и точность, домашка, занятия с репетитором, пробник и оплата — одним сообщением в 19:00.
          </span>
        </span>
      </label>
    </form>
  );
}
