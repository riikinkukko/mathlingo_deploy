"use client";

import { useFormState, useFormStatus } from "react-dom";
import { addParentLinkAction } from "@/app/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-secondary" type="submit" disabled={pending}>
      {pending ? "Добавляем…" : "Пригласить родителя"}
    </button>
  );
}

export default function AddParentForm({ studentId }: { studentId: string }) {
  const [state, formAction] = useFormState<
    { error?: string; success?: boolean; password?: string },
    FormData
  >(addParentLinkAction, {});

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="studentId" value={studentId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <input className="input" name="name" placeholder="Имя родителя" required />
        <input className="input" name="email" type="email" placeholder="Email родителя" required />
        <input className="input" name="password" placeholder="Пароль (необязательно)" />
      </div>
      {state?.error && (
        <p className="rounded-lg bg-coral-light px-3 py-2 text-sm text-coral">{state.error}</p>
      )}
      {state?.success && (
        <p className="rounded-lg bg-pine-light px-3 py-2 text-sm text-pine-dark">
          Готово. Пароль для входа: <span className="font-mono font-semibold">{state.password}</span>
        </p>
      )}
      <SubmitButton />
    </form>
  );
}
