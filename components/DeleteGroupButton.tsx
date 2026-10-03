"use client";

import { useState } from "react";
import { deleteGroupAction } from "@/app/actions-groups";

/** Удаление группы в два нажатия (без системного confirm). */
export default function DeleteGroupButton({ groupId }: { groupId: string }) {
  const [ask, setAsk] = useState(false);
  if (!ask) {
    return (
      <button type="button" onClick={() => setAsk(true)} className="min-h-[44px] text-sm font-bold text-coral hover:underline">
        Удалить группу
      </button>
    );
  }
  return (
    <form action={deleteGroupAction} className="rounded-2xl border border-coral/30 bg-coral-light/40 p-3">
      <input type="hidden" name="groupId" value={groupId} />
      <p className="text-sm font-bold text-ink">Удалить группу? Занятия и задания учеников сохранятся.</p>
      <div className="mt-2 flex gap-2">
        <button type="submit" className="h-10 rounded-pill bg-coral px-4 text-[13px] font-extrabold text-white">
          Удалить
        </button>
        <button type="button" onClick={() => setAsk(false)} className="h-10 rounded-pill bg-white px-4 text-[13px] font-extrabold text-ink-soft">
          Отмена
        </button>
      </div>
    </form>
  );
}
