"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { StudentPayment } from "@/lib/types";
import { formatRub, formatDateRu } from "@/lib/money";
import { pluralRu } from "@/lib/pluralize";
import { updateStudentPaymentAction, AddPaymentState } from "@/app/actions-student-payments";
import DeletePaymentButton from "./DeletePaymentButton";

type Item = StudentPayment & { studentName?: string };

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" type="submit" disabled={pending}>
      {pending ? "Сохраняем…" : "Сохранить"}
    </button>
  );
}

/** Одна оплата: просмотр → по ✎ превращается в форму правки на месте. */
export default function PaymentRow({
  payment: p,
  showStudent,
  from,
}: {
  payment: Item;
  showStudent: boolean;
  from: "student" | "payments";
}) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useFormState<AddPaymentState, FormData>(updateStudentPaymentAction, null);

  // Успешно сохранили — закрываем форму; строка уже с новыми данными (revalidatePath).
  useEffect(() => {
    if (state?.ok) setEditing(false);
  }, [state]);

  if (editing) {
    return (
      <form action={action} className="card space-y-3 border-2 !border-pine/40 p-3.5">
        <input type="hidden" name="paymentId" value={p.id} />
        {showStudent && p.studentName && (
          <p className="font-display text-sm font-black text-ink">{p.studentName}</p>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor={`e-amount-${p.id}`}>Сумма, ₽</label>
            <input
              className="input"
              id={`e-amount-${p.id}`}
              name="amountRub"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              defaultValue={p.amountRub}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor={`e-lessons-${p.id}`}>За сколько занятий</label>
            <input
              className="input"
              id={`e-lessons-${p.id}`}
              name="lessonsCount"
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              step={1}
              defaultValue={p.lessonsCount}
            />
          </div>
          <div>
            <label className="label" htmlFor={`e-date-${p.id}`}>Дата оплаты</label>
            <input
              className="input"
              id={`e-date-${p.id}`}
              name="paidAt"
              type="date"
              defaultValue={p.paidAt}
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor={`e-note-${p.id}`}>Комментарий</label>
          <input
            className="input"
            id={`e-note-${p.id}`}
            name="note"
            maxLength={200}
            defaultValue={p.note ?? ""}
          />
        </div>
        {state?.error && <p className="text-sm font-semibold text-coral">{state.error}</p>}
        <div className="flex items-center gap-3">
          <SaveButton />
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-sm font-bold text-ink-soft hover:text-ink"
          >
            Отмена
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="card flex flex-wrap items-center gap-3 p-3.5">
      <div className="min-w-[88px]">
        <p className="font-mono text-sm font-bold text-ink">{formatRub(p.amountRub)}</p>
        <p className="text-[11px] text-ink-soft">{formatDateRu(p.paidAt)}</p>
      </div>
      <div className="min-w-0 flex-1">
        {showStudent && p.studentName && (
          <p className="font-display text-sm font-black text-ink">{p.studentName}</p>
        )}
        <p className="text-xs text-ink-soft">
          {p.lessonsCount > 0
            ? `за ${p.lessonsCount} ${pluralRu(p.lessonsCount, ["занятие", "занятия", "занятий"])}`
            : "без привязки к занятиям"}
          {p.note && <span> · {p.note}</span>}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          aria-label="Редактировать оплату"
          title="Редактировать"
          onClick={() => setEditing(true)}
          className="flex h-10 w-10 items-center justify-center rounded-pill text-[16px] font-bold text-ink-soft transition hover:bg-line-soft hover:text-ink lg:h-8 lg:w-8"
        >
          ✎
        </button>
        <DeletePaymentButton paymentId={p.id} from={from} />
      </div>
    </div>
  );
}
