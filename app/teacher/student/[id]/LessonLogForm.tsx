"use client";

import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { createLessonLogAction } from "@/app/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" type="submit" disabled={pending}>
      {pending ? "Сохраняем…" : "Добавить запись"}
    </button>
  );
}

/** Сегодня по Москве (а не по UTC: с 0 до 3 ночи МСК UTC-дата — ещё вчерашняя). */
function todayMsk(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Форма записи в журнал. defaultDate/defaultTopic — предзаполнение, когда
 * репетитор пришёл сюда из плашки «Занятие отмечено · Записать отчёт».
 */
export default function LessonLogForm({
  studentId,
  defaultDate,
  defaultTopic,
  autoFocus = false,
}: {
  studentId: string;
  defaultDate?: string;
  defaultTopic?: string;
  autoFocus?: boolean;
}) {
  const reportRef = useRef<HTMLTextAreaElement>(null);
  // Атрибут autoFocus React не применяет к разметке, пришедшей с сервера, —
  // ставим фокус сами: репетитор пришёл сюда именно чтобы написать отчёт.
  useEffect(() => {
    if (!autoFocus || !reportRef.current) return;
    reportRef.current.focus({ preventScroll: true });
    reportRef.current.scrollIntoView({ block: "center" });
  }, [autoFocus]);

  return (
    <form action={createLessonLogAction} className="card space-y-3 p-4">
      <input type="hidden" name="studentId" value={studentId} />
      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        <div>
          <label className="label" htmlFor="date">Дата</label>
          <input
            className="input"
            id="date"
            name="date"
            type="date"
            defaultValue={defaultDate ?? todayMsk()}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="topic">Тема занятия</label>
          <input
            className="input"
            id="topic"
            name="topic"
            defaultValue={defaultTopic ?? ""}
            placeholder="Например, «Неравенства»"
            required
          />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="report">Отчёт о занятии</label>
        <textarea
          className="input min-h-[110px] resize-y"
          id="report"
          name="report"
          ref={reportRef}
          placeholder="Что прошли, какие успехи, на что обратить внимание, что задано домой…"
          required
        />
      </div>
      <SubmitButton />
    </form>
  );
}
