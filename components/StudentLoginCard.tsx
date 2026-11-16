"use client";

import { useActionState, useState } from "react";
import { resetStudentPasswordAction, type ResetPasswordState } from "@/app/actions-import";

/** Карточка «Вход ученика»: логин и выдача нового пароля (для учеников без почты). */
export default function StudentLoginCard({ studentId, name, login, loginOnly }: { studentId: string; name: string; login: string; loginOnly: boolean }) {
  const [state, action, pending] = useActionState<ResetPasswordState, FormData>(resetStudentPasswordAction, null);
  const [copied, setCopied] = useState(false);
  return (
    <section className="card mb-5 p-4">
      <h3 className="font-black text-ink">Вход ученика</h3>
      <p className="mt-1 text-[13px] text-ink-soft">
        {loginOnly ? "Логин" : "Email"}: <b className="font-mono text-ink">{login}</b> · сайт planimetrika.online или приложение
      </p>
      {loginOnly ? (
        state?.password ? (
          <div className="mt-3 rounded-xl bg-pine-light p-3 text-[13px]">
            <p className="font-bold text-pine-dark">
              Новый пароль: <span className="font-mono text-ink">{state.password}</span>
            </p>
            <p className="mt-1 text-ink-soft">Старый пароль больше не подходит. Перешлите новый ученику или родителям.</p>
            <button
              type="button"
              className="btn-secondary mt-2 !text-xs"
              onClick={() => {
                void navigator.clipboard?.writeText(`${name}, вход в Планиметрику: planimetrika.online\nЛогин: ${state.login}\nПароль: ${state.password}`);
                setCopied(true);
              }}
            >
              {copied ? "✓ Скопировано" : "Скопировать логин и пароль"}
            </button>
          </div>
        ) : (
          <form
            action={action}
            className="mt-3"
            onSubmit={(e) => {
              if (!window.confirm(`Выдать ${name} новый пароль? Старый перестанет подходить.`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="studentId" value={studentId} />
            <button type="submit" className="btn-secondary !text-xs" disabled={pending}>
              {pending ? "Создаём…" : "Забыл пароль? Выдать новый"}
            </button>
            {state?.error && <p className="mt-2 text-xs font-bold text-coral">{state.error}</p>}
          </form>
        )
      ) : (
        <p className="mt-1 text-[12px] text-ink-soft">Если ученик забыл пароль — «Забыли пароль?» на странице входа, письмо придёт на его почту.</p>
      )}
    </section>
  );
}
