"use client";

import { useFormState, useFormStatus } from "react-dom";
import { nudgeStudentAction, NudgeState } from "@/app/actions-nudge";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-9 shrink-0 rounded-pill border-2 border-pine/30 bg-white px-3 text-[13px] font-extrabold text-pine-dark transition hover:border-pine disabled:opacity-60"
    >
      {pending ? "…" : "👋 Напомнить"}
    </button>
  );
}

/** Кнопка «Напомнить» для ученика, который давно не занимался. */
export default function NudgeButton({ studentId, already }: { studentId: string; already?: boolean }) {
  const [state, action] = useFormState<NudgeState, FormData>(nudgeStudentAction, null);
  if (already || (state && "ok" in state)) {
    return (
      <span className="shrink-0 rounded-pill bg-pine-light px-3 py-1.5 text-[12px] font-extrabold text-pine-dark">
        {state && "ok" in state ? (state.viaTelegram ? "✓ В Telegram" : "✓ Напомнили") : "✓ Напомнили"}
      </span>
    );
  }
  return (
    <form action={action} className="flex shrink-0 items-center gap-2">
      <input type="hidden" name="studentId" value={studentId} />
      {state && "error" in state && <span className="text-[11px] font-bold text-coral-text">{state.error}</span>}
      <Submit />
    </form>
  );
}
