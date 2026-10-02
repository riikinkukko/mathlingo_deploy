"use client";

import { useFormState, useFormStatus } from "react-dom";
import { addStudentAction } from "@/app/actions";
import StudentCreated from "./StudentCreated";

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
    { error?: string; success?: boolean; password?: string; email?: string; name?: string; studentId?: string },
    FormData
  >(addStudentAction, {});

  if (state?.success && state.password && state.email && state.studentId) {
    return <StudentCreated name={state.name ?? ""} email={state.email} password={state.password} studentId={state.studentId} />;
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
        <input className="input" id="password" name="password" placeholder="оставьте пустым — сгенерируем" />
      </div>
      <label className="flex items-start gap-2.5 text-[13px] leading-snug text-ink-soft">
        <input type="checkbox" name="consent" required className="mt-0.5 h-4 w-4 shrink-0 accent-pine" />
        <span>
          Подтверждаю, что получил(а) согласие ученика (или его законного
          представителя, если ученику нет 14 лет) на обработку персональных
          данных в соответствии с{" "}
          <a href="/legal/privacy" target="_blank" className="font-bold text-pine hover:underline">
            Политикой конфиденциальности
          </a>{" "}
          сервиса.
        </span>
      </label>
      {state?.error && (
        <p className="rounded-lg bg-coral-light px-3 py-2 text-sm text-coral">{state.error}</p>
      )}
      <SubmitButton />
    </form>
  );
}
