"use client";

import { useEffect, useRef, useActionState } from "react";
import { useKeepFormValues } from "@/lib/use-keep-form-values";
import { useFormStatus } from "react-dom";
import { answerQuestionAction, AnswerQuestionState } from "@/app/actions-questions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary !normal-case !tracking-normal">
      {pending ? "Отправляем…" : "Ответить"}
    </button>
  );
}

export default function AnswerQuestionForm({ questionId }: { questionId: string }) {
  const [state, action, actionPending] = useActionState<AnswerQuestionState, FormData>(answerQuestionAction, null);
  const keepAction = useKeepFormValues(actionPending);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} onSubmit={keepAction} className="mt-3 space-y-2">
      <input type="hidden" name="questionId" value={questionId} />
      <label className="sr-only" htmlFor={`a-${questionId}`}>Ответ ученику</label>
      <textarea
        id={`a-${questionId}`}
        name="answer"
        rows={3}
        maxLength={3000}
        required
        className="input resize-y text-[15px]"
        placeholder="Объясните шаг или дайте подсказку — ученик получит ответ в приложении и Telegram"
      />
      {state?.error && <p className="text-sm font-semibold text-coral">{state.error}</p>}
      <Submit />
    </form>
  );
}
