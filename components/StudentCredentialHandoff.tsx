"use client";

import { useActionState } from "react";
import { takeStudentCredentialsAction } from "@/app/actions";

export default function StudentCredentialHandoff() {
  const [state, action, pending] = useActionState<{ error?: string }, FormData>(takeStudentCredentialsAction, {});
  return (
    <form action={action} className="card space-y-3 p-4">
      <h2 className="font-display font-black">Пароль для самостоятельного входа</h2>
      <p className="text-sm text-ink-soft">Придумай пароль, который знаешь только ты. После смены войди с новым паролем и своим коротким логином.</p>
      <label className="block text-sm font-bold">Текущий пароль
        <input className="input mt-1 w-full" name="currentPassword" type="password" autoComplete="current-password" required />
      </label>
      <label className="block text-sm font-bold">Новый пароль
        <input className="input mt-1 w-full" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required />
      </label>
      {state.error && <p role="alert" className="text-sm text-coral">{state.error}</p>}
      <button type="submit" className="btn-primary" disabled={pending}>Сменить пароль</button>
    </form>
  );
}
