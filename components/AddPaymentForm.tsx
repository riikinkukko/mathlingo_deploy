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
  priceRub,
}: {
  studentId?: string;
  /** priceRub — цена занятия ученика: если есть, «за сколько занятий» не спрашиваем */
  students?: { id: string; name: string; priceRub?: number | null }[];
  /** цена занятия ученика (страница ученика) */
  priceRub?: number | null;
}) {
  const [state, formAction] = useFormState<AddPaymentState, FormData>(addStudentPaymentAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [showSaved, setShowSaved] = useState(false);
  const [selected, setSelected] = useState(studentId ?? "");
  const [amount, setAmount] = useState("");
  const price = studentId ? priceRub ?? null : students?.find((s) => s.id === selected)?.priceRub ?? null;

  useEffect(() => {
    if (!state?.ok || !formRef.current) return;
    const f = formRef.current;
    setAmount("");
    const lc = f.elements.namedItem("lessonsCount") as HTMLInputElement | null;
    if (lc) lc.value = "1";
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
          <select
            className="input"
            id="pay-studentId"
            name="studentId"
            required
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
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
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        {price ? (
          // Цена занятия известна — баланс считается в рублях, количество занятий не нужно.
          <div className="flex flex-col justify-end pb-2 text-[13px] text-ink-soft">
            {Number(amount) > 0
              ? `≈ ${Math.floor(Number(amount) / price)} по ${price.toLocaleString("ru-RU")} ₽`
              : `цена занятия ${price.toLocaleString("ru-RU")} ₽`}
          </div>
        ) : (
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
        )}
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
