"use client";

import { useFormState, useFormStatus } from "react-dom";
import { registerAction } from "@/app/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary w-full" type="submit" disabled={pending}>
      {pending ? "Создаём аккаунт…" : "Начать бесплатно"}
    </button>
  );
}

export default function RegisterForm() {
  const [state, formAction] = useFormState<{ error?: string }, FormData>(registerAction, {});

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="label" htmlFor="name">Имя</label>
        <input className="input" id="name" name="name" required placeholder="Как к тебе обращаться" />
      </div>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input className="input" id="email" name="email" type="email" required placeholder="you@example.ru" />
      </div>
      <div>
        <label className="label" htmlFor="password">Пароль</label>
        <input className="input" id="password" name="password" type="password" required placeholder="минимум 6 символов" />
      </div>
      {state?.error && (
        <p className="rounded-lg bg-coral-light px-3 py-2 text-sm text-coral">{state.error}</p>
      )}
      <SubmitButton />
    </form>
  );
}
