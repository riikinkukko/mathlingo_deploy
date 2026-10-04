"use client";

import { useEffect } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { rescheduleLessonAction, RescheduleState } from "@/app/actions-schedule";

/** «YYYY-MM-DDTHH:MM» по Москве — для <input type="datetime-local">. */
export function toMskInput(iso: string): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="h-12 flex-1 rounded-2xl bg-pine text-[15px] font-black text-white disabled:opacity-60">
      {pending ? "Переносим…" : "Перенести"}
    </button>
  );
}

/** Перенос занятия: новая дата/время, длительность; для серии — «только это / это и следующие». */
export default function RescheduleDialog({
  lessonId,
  startsAt,
  durationMin,
  seriesId,
  wholeGroup = false,
  title,
  onClose,
}: {
  lessonId: string;
  startsAt: string;
  durationMin: number;
  seriesId: string | null;
  wholeGroup?: boolean;
  title?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, action] = useFormState<RescheduleState, FormData>(rescheduleLessonAction, null);

  useEffect(() => {
    if (!state?.ok) return;
    router.refresh();
    onClose();
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center lg:items-center" role="dialog" aria-label="Перенести занятие">
      <button type="button" aria-label="Закрыть" onClick={onClose} className="absolute inset-0 bg-ink/40" />
      <form action={action} className="relative w-full max-w-md space-y-3 rounded-t-[28px] bg-white p-5 pb-[max(20px,env(safe-area-inset-bottom))] text-ink lg:rounded-[28px]">
        <div className="mx-auto mb-1 h-1.5 w-10 rounded-full bg-line lg:hidden" />
        <p className="font-display text-[19px] font-black">Перенести занятие</p>
        {title && <p className="-mt-2 text-[13px] text-ink-soft">{title}</p>}
        <input type="hidden" name="lessonId" value={lessonId} />
        {wholeGroup && <input type="hidden" name="wholeGroup" value="1" />}
        <div className="grid grid-cols-[minmax(0,1fr)_84px] gap-2">
          <div>
            <label className="label" htmlFor="rs-start">Новое время (МСК)</label>
            <input id="rs-start" name="startsAt" type="datetime-local" required defaultValue={toMskInput(startsAt)} className="input w-full min-w-0" />
          </div>
          <div>
            <label className="label" htmlFor="rs-dur">Мин</label>
            <input id="rs-dur" name="durationMin" type="number" min={15} max={300} step={15} defaultValue={durationMin} className="input w-full min-w-0" />
          </div>
        </div>
        {seriesId && (
          <fieldset className="space-y-1.5">
            <legend className="sr-only">Что перенести</legend>
            {(
              [
                ["one", "Только это занятие"],
                ["following", "Это и все следующие (весь ряд сдвинется)"],
              ] as const
            ).map(([v, label]) => (
              <label key={v} className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-line-soft px-3 text-[14px] font-bold has-[:checked]:border-pine has-[:checked]:bg-pine-light/40">
                <input type="radio" name="scope" value={v} defaultChecked={v === "one"} className="h-5 w-5 accent-pine" />
                {label}
              </label>
            ))}
          </fieldset>
        )}
        <p className="text-[12px] text-ink-soft">Ученик{wholeGroup ? "и группы получат" : " получит"} уведомление о новом времени.</p>
        {state?.error && <p className="text-sm font-semibold text-coral">{state.error}</p>}
        <div className="flex gap-2">
          <Submit />
          <button type="button" onClick={onClose} className="h-12 rounded-2xl border-2 border-line px-4 text-[15px] font-extrabold text-ink-soft">
            Отмена
          </button>
        </div>
      </form>
    </div>
  );
}
