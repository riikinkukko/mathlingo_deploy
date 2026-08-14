"use client";

import { useFormState, useFormStatus } from "react-dom";
import { loginAction } from "@/app/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary w-full" type="submit" disabled={pending}>
      {pending ? "Входим…" : "Войти"}
    </button>
  );
}

export default function LoginForm() {
  const [state, formAction] = useFormState<{ error?: string }, FormData>(
    loginAction,
    {}
  );
  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          className="input"
          id="email"
          name="email"
          type="email"
          placeholder="student@demo.ru"
          required
        />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Пароль
        </label>
        <input
          className="input"
          id="password"
          name="password"
          type="password"
          placeholder="••••••••"
          required
        />
      </div>
      {state?.error && (
        <p className="rounded-lg bg-coral-light px-3 py-2 text-sm text-coral">
          {state.error}
        </p>
      )}
      <SubmitButton />
    </form>
  );
}
