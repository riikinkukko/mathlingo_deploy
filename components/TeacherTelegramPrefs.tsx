"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState } from "react-dom";
import { saveTeacherTelegramPrefsAction, TgPrefsState } from "@/app/actions-telegram";

const ITEMS = [
  {
    name: "homework",
    title: "Ученик сдал домашку",
    hint: "Когда ученик ответил на все задачи задания: сколько верно и сколько решений ждут проверки.",
  },
  {
    name: "lessons",
    title: "Занятие прошло — было или не было?",
    hint: "Через 10 минут после конца занятия с кнопками «Было / Не было» — отметка прямо из Telegram.",
  },
  {
    name: "digest",
    title: "Утренняя сводка в 8:30",
    hint: "Занятия на сегодня, работы на проверке, неотмеченные занятия и долги. Если дел нет — не приходит.",
  },
] as const;

/** Переключатели «что присылать репетитору в Telegram». Сохраняются сразу. */
export default function TeacherTelegramPrefs({
  homework,
  lessons,
  digest,
}: {
  homework: boolean;
  lessons: boolean;
  digest: boolean;
}) {
  const [state, action] = useFormState<TgPrefsState, FormData>(saveTeacherTelegramPrefsAction, null);
  const form = useRef<HTMLFormElement>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!state?.ok) return;
    setSaved(true);
    const t = setTimeout(() => setSaved(false), 2500);
    return () => clearTimeout(t);
  }, [state]);
  const values = { homework, lessons, digest };

  return (
    <form ref={form} action={action} className="space-y-3 rounded-2xl bg-pine-light/50 p-4">
      <p className="flex items-center justify-between text-xs font-black uppercase tracking-wide text-ink-soft">
        Что присылать
        {saved && <span className="normal-case tracking-normal text-pine-dark">✓ Сохранено</span>}
      </p>
      {ITEMS.map((it) => (
        <label key={it.name} className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            name={it.name}
            defaultChecked={values[it.name]}
            onChange={() => form.current?.requestSubmit()}
            className="mt-0.5 h-4 w-4 shrink-0 accent-pine"
          />
          <span>
            <span className="block text-sm font-bold text-ink">{it.title}</span>
            <span className="block text-xs text-ink-soft">{it.hint}</span>
          </span>
        </label>
      ))}
      <p className="text-xs text-ink-soft">
        В любой момент напишите боту <b>/today</b> — пришлёт дела на сегодня.
      </p>
      {state?.error && <p className="text-sm font-semibold text-coral">{state.error}</p>}
    </form>
  );
}
