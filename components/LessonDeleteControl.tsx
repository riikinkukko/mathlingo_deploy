"use client";

import { useState } from "react";
import { deleteLessonAction, deleteLessonSeriesFromAction } from "@/app/actions-schedule";

/**
 * Кнопка удаления занятия. Для разового — сразу удаляет. Для занятия из
 * еженедельной серии — спрашивает: только это или это и все следующие.
 */
export default function LessonDeleteControl({
  lessonId,
  seriesId,
  from,
}: {
  lessonId: string;
  seriesId: string | null;
  from: "student" | "schedule";
}) {
  const [open, setOpen] = useState(false);

  const hidden = (
    <>
      <input type="hidden" name="lessonId" value={lessonId} />
      <input type="hidden" name="from" value={from} />
    </>
  );

  if (!seriesId) {
    return (
      <form action={deleteLessonAction}>
        {hidden}
        <button
          type="submit"
          aria-label="Удалить занятие"
          className="rounded-pill px-2 py-1 text-[11px] font-bold text-coral transition hover:bg-coral-light"
        >
          ✕
        </button>
      </form>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Удалить занятие"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded-pill px-2 py-1 text-[11px] font-bold text-coral transition hover:bg-coral-light"
      >
        ✕
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-20 w-56 rounded-xl border border-line bg-white p-1.5 shadow-soft">
          <form action={deleteLessonAction}>
            {hidden}
            <button
              type="submit"
              className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-ink hover:bg-line-soft"
            >
              Только это занятие
            </button>
          </form>
          <form action={deleteLessonSeriesFromAction}>
            {hidden}
            <button
              type="submit"
              className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-coral hover:bg-coral-light"
            >
              Это и все следующие
            </button>
          </form>
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
