"use client";

import { useFormState, useFormStatus } from "react-dom";
import { resetPasswordAction } from "@/app/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary w-full" type="submit" disabled={pending}>
      {pending ? "Сохраняем…" : "Сохранить новый пароль"}
    </button>
  );
}

export default function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction] = useFormState<{ error?: string }, FormData>(resetPasswordAction, {});

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label className="label" htmlFor="password">Новый пароль</label>
        <input
          className="input"
          id="password"
          name="password"
          type="password"
          required
          placeholder="минимум 6 символов"
        />
      </div>
      {state?.error && (
        <p className="rounded-lg bg-coral-light px-3 py-2 text-sm text-coral">{state.error}</p>
      )}
      <SubmitButton />
    </form>
  );
}
