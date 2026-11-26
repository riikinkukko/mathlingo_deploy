"use client";

import { useActionState } from "react";
import { useKeepFormValues } from "@/lib/use-keep-form-values";
import { useFormStatus } from "react-dom";
import { addParentLinkAction } from "@/app/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-secondary" type="submit" disabled={pending}>
      {pending ? "Добавляем…" : "Пригласить родителя"}
    </button>
  );
}

export default function AddParentForm({ studentId }: { studentId: string }) {
  const [state, formAction, formActionPending] = useActionState<
    { error?: string; success?: boolean },
    FormData
  >(addParentLinkAction, {});
  const keepFormAction = useKeepFormValues(formActionPending);

  return (
    <form action={formAction} onSubmit={keepFormAction} className="space-y-3">
      <input type="hidden" name="studentId" value={studentId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <input className="input" name="name" placeholder="Имя родителя" required />
        <input className="input" name="email" type="email" placeholder="Email родителя" required />
      </div>
      <label className="flex items-start gap-2.5 text-[13px] leading-snug text-ink-soft">
        <input type="checkbox" name="consent" required className="mt-0.5 h-4 w-4 shrink-0 accent-pine" />
        <span>
          Подтверждаю, что получил(а) согласие родителя на обработку его
          персональных данных в соответствии с{" "}
          <a href="/legal/privacy" target="_blank" className="font-bold text-pine hover:underline">
            Политикой конфиденциальности
          </a>{" "}
          сервиса.
        </span>
      </label>
      {state?.error && (
        <p className="rounded-lg bg-coral-light px-3 py-2 text-sm text-coral">{state.error}</p>
      )}
      {state?.success && (
        <p className="rounded-lg bg-pine-light px-3 py-2 text-sm text-pine-dark">
          Запрос создан. Поддержка проверит связь и направит ссылку родителю.
        </p>
      )}
      <SubmitButton />
    </form>
  );
}
