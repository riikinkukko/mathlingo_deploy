"use client";

import { useActionState } from "react";
import { completeStudentSignupAction } from "@/app/actions";

export default function StudentSignupPassword({ token }: { token: string }) {
  const [state, action, pending] = useActionState<{ error?: string }, FormData>(completeStudentSignupAction, {});
  return (
    <form action={action} className="card space-y-3 p-4 text-left">
      <h1 className="font-display text-xl font-black">Подтвердите аккаунт и задайте свой пароль</h1>
      <p className="text-sm text-ink-soft">Придумайте новый пароль. После сохранения войдите с ним. Предыдущие сеансы будут завершены.</p>
      <input type="hidden" name="token" value={token} />
      <label className="block text-sm font-bold">Новый пароль
        <input className="input mt-1 w-full" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required />
      </label>
      {state.error && <p role="alert" className="text-sm text-coral">{state.error}</p>}
      <button type="submit" className="btn-primary" disabled={pending}>Подтвердить и сохранить пароль</button>
    </form>
  );
}
