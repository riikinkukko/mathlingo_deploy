"use client";

import { useState } from "react";
import { deleteLessonAction, deleteLessonSeriesFromAction } from "@/app/actions-schedule";

/**
 * Кнопка удаления занятия. Сначала открывается подтверждение (раньше разовое
 * удалялось с одного нажатия — легко промахнуться на телефоне). Для занятия
 * из еженедельной серии — выбор: только это или это и все следующие.
 */
export default function LessonDeleteControl({
  lessonId,
  seriesId,
  from,
  wholeGroup = false,
}: {
  lessonId: string;
  seriesId: string | null;
  from: "student" | "schedule" | "group" | "home";
  /** групповое занятие в общем списке: удалить у всех учеников группы */
  wholeGroup?: boolean;
}) {
  const [open, setOpen] = useState(false);

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
        aria-label="Удалить занятие"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 items-center justify-center rounded-pill text-[15px] font-bold text-coral transition hover:bg-coral-light lg:h-8 lg:w-8"
      >
        ✕
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-20 w-56 rounded-xl border border-line bg-white p-1.5 shadow-soft">
          <form action={deleteLessonAction}>
            {hidden}
            <button
              type="submit"
              className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-coral hover:bg-coral-light"
            >
              {seriesId ? "Только это занятие" : wholeGroup ? "Удалить занятие группы" : "Удалить занятие"}
            </button>
          </form>
          {seriesId && (
            <form action={deleteLessonSeriesFromAction}>
              {hidden}
              <button
                type="submit"
                className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-coral hover:bg-coral-light"
              >
                Это и все следующие
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
    </div>
  );
}
