"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { addStudentPaymentAction, AddPaymentState } from "@/app/actions-student-payments";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" type="submit" disabled={pending}>
      {pending ? "Сохраняем…" : "Записать оплату"}
    </button>
  );
}

function todayMsk(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Форма записи оплаты. Как и форма расписания — два режима: с фиксированным
 * учеником (страница ученика) или с выбором из списка (страница оплат).
 * После сохранения сбрасываются сумма, количество занятий, дата и комментарий;
 * выбранный ученик остаётся.
 */
export default function AddPaymentForm({
  studentId,
  students,
}: {
  studentId?: string;
  students?: { id: string; name: string }[];
}) {
  const [state, formAction] = useFormState<AddPaymentState, FormData>(addStudentPaymentAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (!state?.ok || !formRef.current) return;
    const f = formRef.current;
    (f.elements.namedItem("amountRub") as HTMLInputElement).value = "";
    (f.elements.namedItem("lessonsCount") as HTMLInputElement).value = "1";
    (f.elements.namedItem("paidAt") as HTMLInputElement).value = todayMsk();
    (f.elements.namedItem("note") as HTMLInputElement).value = "";
    setShowSaved(true);
    const t = setTimeout(() => setShowSaved(false), 3000);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="card space-y-3 p-4">
      {studentId && <input type="hidden" name="studentId" value={studentId} />}

      {!studentId && students && (
        <div>
          <label className="label" htmlFor="pay-studentId">Ученик</label>
          <select className="input" id="pay-studentId" name="studentId" required defaultValue="">
            <option value="" disabled>
              Выберите ученика…
            </option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="pay-amount">Сумма, ₽</label>
          <input
            className="input"
            id="pay-amount"
            name="amountRub"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            placeholder="например, 6000"
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="pay-lessons">За сколько занятий</label>
          <input
            className="input"
            id="pay-lessons"
            name="lessonsCount"
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            step={1}
            defaultValue={1}
          />
        </div>
        <div>
          <label className="label" htmlFor="pay-date">Дата оплаты</label>
          <input className="input" id="pay-date" name="paidAt" type="date" defaultValue={todayMsk()} />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="pay-note">Комментарий (необязательно)</label>
        <input
          className="input"
          id="pay-note"
          name="note"
          maxLength={200}
          placeholder="Например, «перевод на Тинькофф» или «абонемент на месяц»"
        />
      </div>

      {state?.error && <p className="text-sm font-semibold text-coral">{state.error}</p>}

      <div className="flex items-center gap-3">
        <SubmitButton />
        {showSaved && <span className="text-sm font-bold text-pine">✓ Оплата записана</span>}
      </div>
    </form>
  );
}
