"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createLessonLogAction } from "@/app/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" type="submit" disabled={pending}>
      {pending ? "Сохраняем…" : "Добавить запись"}
    </button>
  );
}

export default function LessonLogForm({ studentId }: { studentId: string }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form action={createLessonLogAction} className="card space-y-3 p-4">
      <input type="hidden" name="studentId" value={studentId} />
      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        <div>
          <label className="label" htmlFor="date">Дата</label>
          <input className="input" id="date" name="date" type="date" defaultValue={today} required />
        </div>
        <div>
          <label className="label" htmlFor="topic">Тема занятия</label>
          <input className="input" id="topic" name="topic" placeholder="Например, «Неравенства»" required />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="report">Отчёт о занятии</label>
        <textarea
          className="input min-h-[110px] resize-y"
          id="report"
          name="report"
          placeholder="Что прошли, какие успехи, на что обратить внимание, что задано домой…"
          required
        />
      </div>
      <SubmitButton />
    </form>
  );
}
