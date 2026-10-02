"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { saveDreamAction, DreamState } from "@/app/actions-student-goals";
import { pluralRu } from "@/lib/pluralize";

function Save() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary !normal-case !tracking-normal">
      {pending ? "Сохраняем…" : "Сохранить"}
    </button>
  );
}

/**
 * «Цель и план» в профиле ученика: вуз мечты (вводит сам), целевой балл,
 * сколько дней до ЕГЭ и сколько уроков в день, чтобы успеть пройти программу.
 */
export default function ExamPlanCard({
  dream,
  targetScore,
  canEditTarget,
  daysLeft,
  remaining,
  total,
  perWeek,
  perDayText,
  estimateNote,
}: {
  dream?: string;
  targetScore?: number;
  canEditTarget: boolean;
  daysLeft: number;
  remaining: number;
  total: number;
  perWeek: number;
  perDayText: string;
  estimateNote: string;
}) {
  const [editing, setEditing] = useState(!dream);
  const [state, action] = useFormState<DreamState, FormData>(saveDreamAction, null);
  useEffect(() => {
    if (state?.ok) setEditing(false);
  }, [state]);

  return (
    <section className="mb-4 rounded-[24px] bg-pine-darker p-4 text-white">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-extrabold text-pine-mint">Моя цель</p>
          <p className="mt-0.5 font-display text-[20px] font-black leading-tight">
            {dream || "Вуз мечты не указан"}
          </p>
          <p className="mt-1 text-[14px] text-pine-mint">
            {targetScore ? `Нужно по профильной математике: ${targetScore}` : "Целевой балл не задан"}
          </p>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="min-h-[40px] shrink-0 rounded-xl bg-white/10 px-3 text-[13px] font-extrabold"
          >
            Изменить
          </button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl bg-white px-2 py-2.5 text-ink">
          <p className="font-display text-[22px] font-black leading-none">{daysLeft}</p>
          <p className="mt-1 text-[11px] font-bold text-ink-soft">{pluralRu(daysLeft, ["день", "дня", "дней"])} до ЕГЭ*</p>
        </div>
        <div className="rounded-2xl bg-white px-2 py-2.5 text-ink">
          <p className="font-display text-[22px] font-black leading-none">{remaining}</p>
          <p className="mt-1 text-[11px] font-bold text-ink-soft">{pluralRu(remaining, ["урок", "урока", "уроков"])} осталось из {total}</p>
        </div>
        <div className="rounded-2xl bg-white px-2 py-2.5 text-ink">
          <p className="font-display text-[22px] font-black leading-none">{perWeek}</p>
          <p className="mt-1 text-[11px] font-bold text-ink-soft">{pluralRu(perWeek, ["урок", "урока", "уроков"])} в неделю</p>
        </div>
      </div>
      <p className="mt-3 text-[14px] font-bold">
        {remaining > 0 ? `План: ${perDayText} в день, 5 дней в неделю — и программа пройдена к экзамену.` : "Программа пройдена — повторяй и решай пробники."}
      </p>
      <p className="mt-1 text-[11px] text-pine-mint">{estimateNote}</p>

      {editing && (
        <form action={action} className="mt-4 space-y-3 rounded-2xl bg-white p-3 text-ink">
          <div>
            <label htmlFor="dreamUniversity" className="label">Вуз и направление мечты</label>
            <input
              id="dreamUniversity"
              name="dreamUniversity"
              defaultValue={dream ?? ""}
              maxLength={120}
              className="input"
              placeholder="Например: МГУ, ВМК"
            />
          </div>
          {canEditTarget && (
            <div>
              <label htmlFor="targetScore" className="label">Сколько баллов нужно по математике</label>
              <input
                id="targetScore"
                name="targetScore"
                type="number"
                min={1}
                max={100}
                defaultValue={targetScore ?? ""}
                className="input"
                placeholder="Посмотри проходной на сайте вуза"
              />
            </div>
          )}
          {state?.error && <p className="text-sm font-semibold text-coral">{state.error}</p>}
          <div className="flex gap-2">
            <Save />
            {dream && (
              <button type="button" onClick={() => setEditing(false)} className="btn-secondary !normal-case !tracking-normal">
                Отмена
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
