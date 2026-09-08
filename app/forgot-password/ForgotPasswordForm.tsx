"use client";

import { useFormState, useFormStatus } from "react-dom";
import { requestPasswordResetAction } from "@/app/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary w-full" type="submit" disabled={pending}>
      {pending ? "Отправляем…" : "Отправить ссылку"}
    </button>
  );
}

export default function ForgotPasswordForm() {
  const [state, formAction] = useFormState<{ error?: string; success?: boolean }, FormData>(
    requestPasswordResetAction,
    {}
  );

  if (state?.success) {
    return (
      <p className="text-center text-sm text-ink-soft">
        Если такой email зарегистрирован — письмо со ссылкой для сброса пароля
        уже отправлено. Проверьте почту (и папку «Спам», на всякий случай).
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input className="input" id="email" name="email" type="email" required placeholder="you@example.ru" />
      </div>
      {state?.error && (
        <p className="rounded-lg bg-coral-light px-3 py-2 text-sm text-coral">{state.error}</p>
      )}
      <SubmitButton />
    </form>
  );
}
