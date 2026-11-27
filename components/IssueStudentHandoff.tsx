"use client";

import { useActionState } from "react";
import { issueStudentHandoffAction } from "@/app/admin/actions";

export default function IssueStudentHandoff({ studentId }: { studentId: string }) {
  const [state, action, pending] = useActionState(issueStudentHandoffAction, {});
  return (
    <form action={action} className="card mb-4 space-y-2 p-4">
      <h2 className="font-bold">Передача доступа ученику</h2>
      <p className="text-sm">Выдавайте код только после независимой проверки личности. Для входа по email подтвердите, что зарегистрированный ящик принадлежит ученику. Передайте код ученику напрямую по проверенному каналу.</p>
      <input type="hidden" name="studentId" value={studentId} />
      <label className="block text-sm"><input type="checkbox" name="identityVerified" required /> Личность и канал подтверждены</label>
      <button type="submit" className="btn-primary" disabled={pending}>Выпустить одноразовый код</button>
      {state.error && <p role="alert">{state.error}</p>}
      {state.code && <p className="break-all font-mono" role="status">{state.code}</p>}
    </form>
  );
}
