"use client";

import { useActionState } from "react";
import { useKeepFormValues } from "@/lib/use-keep-form-values";
import { useFormStatus } from "react-dom";
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
  const [state, formAction, formActionPending] = useActionState<
    {
      error?: string;
      limit?: boolean;
      inviteError?: string;
      invited?: boolean;
      success?: boolean;
      password?: string;
      email?: string;
      name?: string;
      studentId?: string;
    },
    FormData
  >(addStudentAction, {});
  const keepFormAction = useKeepFormValues(formActionPending);

  // Email уже принадлежит самостоятельному ученику — ему ушло приглашение.
  if (state?.invited) {
    return (
      <div className="card space-y-3 p-6" role="status">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-light text-xl" aria-hidden>
          ✉
        </span>
        <h2 className="font-display text-xl font-black text-ink">Приглашение отправлено</h2>
        <p className="text-sm text-ink-soft">
          <b className="text-ink">{state.name}</b> ({state.email}) уже занимается в Планиметрике сам. Мы отправили ему
          приглашение: на главной у ученика появится «Принять / Отклонить», придёт уведомление и письмо. Как только он
          примет, ученик появится в вашем списке — вместе со всем прогрессом.
        </p>
        <p className="text-[13px] text-ink-soft">Ожидающее приглашение видно в списке учеников, его можно отозвать.</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <a href="/teacher" className="btn-primary">
            К ученикам
          </a>
          <a href="/teacher/students/new" className="btn-secondary">
            Добавить ещё
          </a>
        </div>
      </div>
    );
  }

  if (state?.success && state.password && state.email && state.studentId) {
    return <StudentCreated name={state.name ?? ""} email={state.email} password={state.password} studentId={state.studentId} />;
  }

  return (
    <form action={formAction} onSubmit={keepFormAction} className="card space-y-4 p-6">
      <div>
        <label className="label" htmlFor="name">Имя ученика</label>
        <input className="input" id="name" name="name" required placeholder="Иван Иванов" />
      </div>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input className="input" id="email" name="email" type="email" required placeholder="ivan@example.ru" />
      </div>
      <p className="-mt-2 text-[12px] text-ink-soft">
        Если ученик уже зарегистрирован в Планиметрике сам, мы отправим ему приглашение — прогресс сохранится.
      </p>
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
        <p className="rounded-lg bg-coral-light px-3 py-2 text-sm text-coral">
          {state.error}
          {state.inviteError === "already_invited" && (
            <a href="/teacher#students" className="mt-1.5 block text-[13px] font-bold text-coral-text underline">
              Ожидающее приглашение — в списке учеников
            </a>
          )}
          {state.limit && (
            <>
              {" "}
              <a href="/teacher/upgrade" className="font-black underline">
                Выбрать тариф →
              </a>
            </>
          )}
        </p>
      )}
      <SubmitButton />
    </form>
  );
}
