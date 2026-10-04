"use client";

import { useState } from "react";
import { setGroupLessonStatusAction } from "@/app/actions-schedule";
import type { LessonMember } from "@/lib/lesson-collapse";

/**
 * Кнопки группового занятия. «Провести / Было» раскрывает список учеников —
 * все отмечены, снимите галочку с тех, кого не было (им занятие не
 * засчитается в баланс). «Отменить / Не было» — занятия не было ни у кого.
 */
export default function GroupLessonActions({
  groupLessonId,
  members,
  from,
  past = false,
  tone = "light",
}: {
  groupLessonId: string;
  members: LessonMember[];
  from: "schedule" | "home" | "group";
  past?: boolean;
  tone?: "light" | "dark";
}) {
  const [open, setOpen] = useState(false);
  // Отмечаем только ещё не отмеченных: уже отмеченных (на странице ученика)
  // форма не трогает.
  const allMembers = members;
  members = members.filter((m) => m.status === "planned");
  const [present, setPresent] = useState<Set<string>>(() => new Set(members.map((m) => m.studentId)));
  const toggle = (id: string) =>
    setPresent((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const hidden = (
    <>
      <input type="hidden" name="groupLessonId" value={groupLessonId} />
      <input type="hidden" name="from" value={from} />
      {members.map((m) => (
        <input key={m.lessonId} type="hidden" name="lessonIds" value={m.lessonId} />
      ))}
    </>
  );
  const big = tone === "dark";

  if (!open) {
    return (
      <div className={`grid flex-1 grid-cols-2 gap-2 ${big ? "" : "lg:flex lg:flex-none"}`}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          className={
            big
              ? "h-11 w-full rounded-xl bg-pine-dark text-[15px] font-black text-white"
              : "h-10 w-full rounded-pill bg-pine px-4 text-[13px] font-extrabold text-white transition hover:bg-pine-dark lg:h-8 lg:w-auto lg:px-3 lg:text-[12px]"
          }
        >
          {past ? "Было…" : "Провести…"}
        </button>
        <form action={setGroupLessonStatusAction}>
          {hidden}
          <input type="hidden" name="mode" value="cancel" />
          <button
            type="submit"
            className={
              big
                ? "h-11 w-full rounded-xl border-2 border-line bg-white text-[15px] font-extrabold text-ink-soft"
                : "h-10 w-full rounded-pill bg-line-soft px-4 text-[13px] font-extrabold text-ink-soft transition hover:bg-line lg:h-8 lg:w-auto lg:px-3 lg:text-[12px]"
            }
          >
            {past ? "Не было" : "Отменить"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <form action={setGroupLessonStatusAction} className="w-full rounded-2xl border border-line-soft bg-paper p-3 text-ink">
      {hidden}
      <input type="hidden" name="mode" value="attendance" />
      <p className="mb-2 text-[13px] font-extrabold text-ink">Кто был на занятии?</p>
      {allMembers.length > members.length && (
        <p className="mb-2 text-[12px] text-ink-soft">
          Уже отмечены: {allMembers.filter((m) => m.status !== "planned").map((m) => m.studentName.split(" ")[0]).join(", ")}
        </p>
      )}
      <div className="space-y-1.5">
        {members.map((m) => (
          <label
            key={m.studentId}
            className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl bg-white px-3 text-[15px] font-bold"
          >
            <input
              type="checkbox"
              name="present"
              value={m.studentId}
              checked={present.has(m.studentId)}
              onChange={() => toggle(m.studentId)}
              className="h-5 w-5 shrink-0 accent-pine"
            />
            <span className={`truncate ${present.has(m.studentId) ? "" : "text-ink-soft line-through"}`}>{m.studentName}</span>
          </label>
        ))}
      </div>
      <p className="mt-2 text-[12px] text-ink-soft">
        {present.size === members.length
          ? "Были все — занятие засчитается каждому."
          : present.size === 0
            ? "Никого не было — занятие никому не засчитается."
            : `Отсутствующим (${members.length - present.size}) занятие не засчитается в баланс.`}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="submit" className="h-11 rounded-xl bg-pine text-[15px] font-black text-white hover:bg-pine-dark">
          Сохранить
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-11 rounded-xl border-2 border-line bg-white text-[15px] font-extrabold text-ink-soft"
        >
          Отмена
        </button>
      </div>
    </form>
  );
}
