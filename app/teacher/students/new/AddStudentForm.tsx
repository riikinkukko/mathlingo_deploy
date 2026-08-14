"use client";

import { useFormState, useFormStatus } from "react-dom";
import { addStudentAction } from "@/app/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" type="submit" disabled={pending}>
      {pending ? "Создаём…" : "Создать аккаунт"}
    </button>
  );
}

export default function AddStudentForm() {
  const [state, formAction] = useFormState<
    { error?: string; success?: boolean; password?: string },
    FormData
  >(addStudentAction, {});

  if (state?.success) {
    return (
      <div className="card border-pine-light bg-pine-light/30 p-5 text-sm">
        <p className="mb-1 font-semibold text-pine-dark">Ученик добавлен!</p>
        <p className="text-ink-soft">
          Передайте ученику email и пароль для входа:{" "}
          <span className="font-mono font-semibold text-ink">{state.password}</span>
        </p>
        <a href="/teacher" className="btn-secondary mt-4 inline-flex">
          К списку учеников
        </a>
      </div>
    );
  }

  return (
    <form action={formAction} className="card space-y-4 p-6">
      <div>
        <label className="label" htmlFor="name">Имя ученика</label>
        <input className="input" id="name" name="name" required placeholder="Иван Иванов" />
      </div>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input className="input" id="email" name="email" type="email" required placeholder="ivan@example.ru" />
      </div>
      <div>
        <label className="label" htmlFor="password">Пароль (необязательно)</label>
        <input className="input" id="password" name="password" placeholder="по умолчанию demo1234" />
      </div>
      {state?.error && (
        <p className="rounded-lg bg-coral-light px-3 py-2 text-sm text-coral">{state.error}</p>
      )}
      <SubmitButton />
    </form>
  );
}
