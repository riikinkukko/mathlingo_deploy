"use client";

import { useFormStatus } from "react-dom";
import { deleteStudentAction } from "@/app/actions";

function Button({ studentName }: { studentName: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (
          !window.confirm(
            `Удалить ученика «${studentName}»?\n\nБудут безвозвратно удалены его аккаунт, весь прогресс, домашние задания, расписание и журнал занятий. Отменить это действие нельзя.`
          )
        ) {
          e.preventDefault();
        }
      }}
      className="text-sm font-bold text-coral transition hover:underline disabled:opacity-50"
    >
      {pending ? "Удаляем…" : "Удалить ученика"}
    </button>
  );
}

export default function DeleteStudentButton({
  studentId,
  studentName,
}: {
  studentId: string;
  studentName: string;
}) {
  return (
    <form action={deleteStudentAction}>
      <input type="hidden" name="studentId" value={studentId} />
      <Button studentName={studentName} />
    </form>
  );
}
