"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  setTargetScoreAction,
  addMockScoreAction,
  saveStudentNotesAction,
  deleteMockScoreAction,
  GoalFormState,
} from "@/app/actions-student-goals";

function Submit({ label, pendingLabel = "Сохраняем…" }: { label: string; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" type="submit" disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

/** Показывает «✓ …» на 3 секунды после каждого успешного сохранения. */
function useSavedFlash(state: GoalFormState) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!state?.ok) return;
    setShow(true);
    const t = setTimeout(() => setShow(false), 3000);
    return () => clearTimeout(t);
  }, [state]);
  return show;
}

function todayMsk(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function TargetScoreForm({ studentId, targetScore }: { studentId: string; targetScore?: number }) {
  const [state, action] = useFormState<GoalFormState, FormData>(setTargetScoreAction, null);
  const saved = useSavedFlash(state);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="studentId" value={studentId} />
      <div>
        <label className="label" htmlFor="targetScore">Целевой балл</label>
        <input
          className="input w-32"
          id="targetScore"
          name="targetScore"
          type="number"
          inputMode="numeric"
          min={1}
          max={100}
          defaultValue={targetScore ?? ""}
          placeholder="например, 80"
        />
      </div>
      <Submit label="Сохранить цель" />
      {saved && <span className="text-sm font-bold text-pine">✓ Сохранено</span>}
      {state?.error && <p className="w-full text-sm font-semibold text-coral">{state.error}</p>}
      <p className="w-full text-[11px] text-ink-soft">
        Ученик увидит у себя на главной подсказку по темпу занятий под эту цель. Оставьте поле пустым,
        чтобы убрать цель.
      </p>
    </form>
  );
}

export function AddMockScoreForm({ studentId }: { studentId: string }) {
  const [state, action] = useFormState<GoalFormState, FormData>(addMockScoreAction, null);
  const saved = useSavedFlash(state);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state?.ok || !formRef.current) return;
    const f = formRef.current;
    (f.elements.namedItem("score") as HTMLInputElement).value = "";
    (f.elements.namedItem("takenAt") as HTMLInputElement).value = todayMsk();
    (f.elements.namedItem("note") as HTMLInputElement).value = "";
  }, [state]);

  return (
    <form ref={formRef} action={action} className="card space-y-3 p-4">
      <input type="hidden" name="studentId" value={studentId} />
      <div className="grid gap-3 sm:grid-cols-[120px_170px_1fr]">
        <div>
          <label className="label" htmlFor="mock-score">Балл</label>
          <input
            className="input"
            id="mock-score"
            name="score"
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            required
            placeholder="0–100"
          />
        </div>
        <div>
          <label className="label" htmlFor="mock-date">Дата</label>
          <input className="input" id="mock-date" name="takenAt" type="date" defaultValue={todayMsk()} />
        </div>
        <div>
          <label className="label" htmlFor="mock-note">Комментарий</label>
          <input
            className="input"
            id="mock-note"
            name="note"
            maxLength={200}
            placeholder="например, «вариант Ященко №5»"
          />
        </div>
      </div>
      {state?.error && <p className="text-sm font-semibold text-coral">{state.error}</p>}
      <div className="flex items-center gap-3">
        <Submit label="Записать пробник" />
        {saved && <span className="text-sm font-bold text-pine">✓ Пробник записан</span>}
      </div>
    </form>
  );
}

export function DeleteMockButton({ mockId }: { mockId: string }) {
  return (
    <form action={deleteMockScoreAction}>
      <input type="hidden" name="mockId" value={mockId} />
      <button
        type="submit"
        aria-label="Удалить пробник"
        onClick={(e) => {
          if (!window.confirm("Удалить результат этого пробника?")) e.preventDefault();
        }}
        className="rounded-pill px-2 py-1 text-[11px] font-bold text-coral transition hover:bg-coral-light"
      >
        ✕
      </button>
    </form>
  );
}

/** Заметки: в отличие от других форм, текст после сохранения НЕ очищается. */
export function StudentNotesForm({
  studentId,
  notes,
  updatedLabel,
}: {
  studentId: string;
  notes: string;
  updatedLabel: string | null;
}) {
  const [state, action] = useFormState<GoalFormState, FormData>(saveStudentNotesAction, null);
  const saved = useSavedFlash(state);
  return (
    <form action={action} className="card space-y-3 p-4">
      <input type="hidden" name="studentId" value={studentId} />
      <textarea
        className="input min-h-[140px] resize-y"
        name="notes"
        maxLength={5000}
        defaultValue={notes}
        placeholder="Слабые темы, особенности, договорённости с родителями, что повторить на следующем занятии… Видите только вы."
      />
      {state?.error && <p className="text-sm font-semibold text-coral">{state.error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Submit label="Сохранить заметки" />
        {saved ? (
          <span className="text-sm font-bold text-pine">✓ Сохранено</span>
        ) : (
          updatedLabel && <span className="text-xs text-ink-soft">изменено {updatedLabel}</span>
        )}
      </div>
    </form>
  );
}
