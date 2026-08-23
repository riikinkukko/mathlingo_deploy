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
      <label className="flex items-start gap-2.5 text-[13px] leading-snug text-ink-soft">
        <input type="checkbox" name="consent" required className="mt-0.5 h-4 w-4 shrink-0 accent-pine" />
        <span>
          Я согласен(на) с{" "}
          <a href="/legal/terms" target="_blank" className="font-bold text-pine hover:underline">
            Пользовательским соглашением
          </a>
          ,{" "}
          <a href="/legal/privacy" target="_blank" className="font-bold text-pine hover:underline">
            Политикой конфиденциальности
          </a>{" "}
          и даю{" "}
          <a href="/legal/consent" target="_blank" className="font-bold text-pine hover:underline">
            согласие на обработку персональных данных
          </a>
          . Если мне ещё нет 14 лет, регистрацию за меня выполняет родитель или
          законный представитель.
        </span>
      </label>
      {state?.error && (
        <p className="rounded-lg bg-coral-light px-3 py-2 text-sm text-coral">{state.error}</p>
      )}
      <SubmitButton />
    </form>
  );
}
