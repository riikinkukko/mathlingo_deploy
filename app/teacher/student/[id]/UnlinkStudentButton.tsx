"use client";

import { useActionState } from "react";
import { unlinkStudentAction } from "@/app/actions";

export default function UnlinkStudentButton({
  studentId,
  studentName,
  linkVersion,
}: {
  studentId: string;
  studentName: string;
  linkVersion: string;
}) {
  const [state, action, pending] = useActionState<{ error?: string }, FormData>(unlinkStudentAction, {});
  return (
    <form action={action} onSubmit={(event) => {
      if (!window.confirm(`Отвязать ученика «${studentName}»?\n\nВы потеряете доступ к его карточке и прогрессу. Аккаунт, прогресс и задания сохранятся. Будущие занятия с вами будут отменены.`)) {
        event.preventDefault();
      }
    }}>
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="linkVersion" value={linkVersion} />
      <button
        type="submit"
        disabled={pending}
        className="min-h-[44px] rounded-pill border-2 border-coral/30 px-4 text-sm font-bold text-coral transition hover:border-coral hover:bg-coral-light disabled:opacity-50"
      >
        {pending ? "Отвязываем…" : "Отвязать ученика"}
      </button>
      {state.error && <p role="alert" className="mt-2 text-sm text-coral">{state.error}</p>}
    </form>
  );
}
