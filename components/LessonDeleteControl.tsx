"use client";

import { useState } from "react";
import { deleteLessonAction, deleteLessonSeriesFromAction } from "@/app/actions-schedule";
import RescheduleDialog from "./RescheduleDialog";

/**
 * Меню действий с занятием: «Перенести…» и удаление. Удаление — с
 * подтверждением (с одного нажатия легко промахнуться на телефоне); для
 * занятия из еженедельной серии — выбор: только это или это и все следующие.
 */
export default function LessonDeleteControl({
  lessonId,
  seriesId,
  from,
  wholeGroup = false,
  reschedule,
}: {
  lessonId: string;
  seriesId: string | null;
  from: "student" | "schedule" | "group" | "home";
  /** групповое занятие в общем списке: действие для всех учеников группы */
  wholeGroup?: boolean;
  /** есть — в меню появляется «Перенести…» (только у запланированных занятий) */
  reschedule?: { startsAt: string; durationMin: number; title?: string };
}) {
  const [open, setOpen] = useState(false);
  const [moving, setMoving] = useState(false);

  const hidden = (
    <>
      <input type="hidden" name="lessonId" value={lessonId} />
      <input type="hidden" name="from" value={from} />
      {wholeGroup && <input type="hidden" name="wholeGroup" value="1" />}
    </>
  );

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={reschedule ? "Действия с занятием" : "Удалить занятие"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-10 w-10 items-center justify-center rounded-pill text-[15px] font-bold transition lg:h-8 lg:w-8 ${
          reschedule ? "text-ink-soft hover:bg-line-soft" : "text-coral hover:bg-coral-light"
        }`}
      >
        {reschedule ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
        ) : (
          "✕"
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-20 w-60 rounded-xl border border-line bg-white p-1.5 shadow-soft">
          {reschedule && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setMoving(true);
              }}
              className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-bold text-ink hover:bg-paper"
            >
              Перенести…
            </button>
          )}
          <form action={deleteLessonAction}>
            {hidden}
            <button
              type="submit"
              className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-coral hover:bg-coral-light"
            >
              {seriesId ? "Удалить только это" : wholeGroup ? "Удалить занятие группы" : "Удалить занятие"}
            </button>
          </form>
          {seriesId && (
            <form action={deleteLessonSeriesFromAction}>
              {hidden}
              <button
                type="submit"
                className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-coral hover:bg-coral-light"
              >
                Удалить это и все следующие
              </button>
            </form>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-full rounded-lg px-3 py-1.5 text-left text-xs font-bold text-ink-soft hover:text-ink"
          >
            Отмена
          </button>
        </div>
      )}
      {moving && reschedule && (
        <RescheduleDialog
          lessonId={lessonId}
          startsAt={reschedule.startsAt}
          durationMin={reschedule.durationMin}
          seriesId={seriesId}
          wholeGroup={wholeGroup}
          title={reschedule.title}
          onClose={() => setMoving(false)}
        />
      )}
    </div>
  );
}
