"use client";

import { useActionState } from "react";
import { completeStudentSignupAction, confirmParentAccessAction } from "@/app/actions";

export default function StudentSignupPassword({ token, parent = false }: { token: string; parent?: boolean }) {
  const [state, action, pending] = useActionState<{ error?: string }, FormData>(parent ? confirmParentAccessAction : completeStudentSignupAction, {});
  return (
    <form action={action} className="card space-y-3 p-4 text-left">
      <h1 className="font-display text-xl font-black">Подтвердите аккаунт и задайте свой пароль</h1>
      <p className="text-sm text-ink-soft">Придумайте новый пароль. После сохранения войдите с ним. Предыдущие сеансы будут завершены.</p>
      <input type="hidden" name="token" value={token} />
      <label className="block text-sm font-bold">Новый пароль
        <input className="input mt-1 w-full" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required />
      </label>
      {parent && <label className="block text-sm"><input name="consent" type="checkbox" required /> Подтверждаю согласие на обработку данных по <a href="/legal/privacy" target="_blank" rel="noreferrer">политике конфиденциальности</a>.</label>}
      {state.error && <p role="alert" className="text-sm text-coral">{state.error}</p>}
      <button type="submit" className="btn-primary" disabled={pending}>Подтвердить и сохранить пароль</button>
    </form>
  );
}
