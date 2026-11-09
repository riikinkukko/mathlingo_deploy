"use client";

import { useActionState } from "react";
import { saveHomeworkAsTemplateAction, type TemplateState } from "@/app/actions-templates";

/** «В шаблоны» у выданного задания: потом его можно выдать другим в два клика. */
export default function SaveTemplateButton({ homeworkId }: { homeworkId: string }) {
  const [state, action, pending] = useActionState<TemplateState, FormData>(saveHomeworkAsTemplateAction, null);
  return (
    <form action={action}>
      <input type="hidden" name="homeworkId" value={homeworkId} />
      <button
        type="submit"
        disabled={pending || !!state?.ok}
        title={state?.error ?? "Сохранить как шаблон"}
        className="rounded-pill px-2.5 py-1.5 text-[12px] font-extrabold text-pine-dark hover:bg-pine-light disabled:opacity-70"
      >
        {state?.ok ? "✓ В шаблонах" : state?.error ? "Не вышло" : pending ? "…" : "В шаблоны"}
      </button>
    </form>
  );
}
