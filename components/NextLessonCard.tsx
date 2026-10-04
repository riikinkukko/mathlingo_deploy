import { lessonWhenLabel } from "@/lib/lesson-time";
import { IconCalendar } from "./icons";

type Lesson = { id: string; startsAt: string; durationMin: number; topic: string | null; groupName?: string | null; groupLessonId?: string | null };

/**
 * Ближайшие занятия ученика с репетитором — на главной ученика.
 * Крупно — ближайшее, ниже строкой — следующие два.
 */
export default function NextLessonCard({ lessons, teacherName }: { lessons: Lesson[]; teacherName?: string | null }) {
  if (lessons.length === 0) return null;
  const [next, ...rest] = lessons;
  const groupLabel = (l: Lesson) => (l.groupLessonId ? (l.groupName ? `группа «${l.groupName}»` : "групповое занятие") : null);
  return (
    <section aria-label="Ближайшее занятие" className="rounded-2xl border border-line-soft bg-white px-4 py-3.5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-pine-light text-pine-dark">
          <IconCalendar className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase tracking-wide text-ink-soft">Ближайшее занятие</p>
          <p className="font-display text-[16px] font-black text-ink">{lessonWhenLabel(next.startsAt, next.durationMin)}</p>
          <p className="truncate text-[13px] text-ink-soft">
            {[groupLabel(next), next.topic, !groupLabel(next) && !next.topic && teacherName ? `с ${teacherName}` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>
      {rest.length > 0 && (
        <ul className="mt-2.5 space-y-1 border-t border-line-soft pt-2.5">
          {rest.slice(0, 2).map((l) => (
            <li key={l.id} className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="font-bold text-ink">{lessonWhenLabel(l.startsAt, l.durationMin)}</span>
              {groupLabel(l) && <span className="truncate text-[12px] text-violet">{groupLabel(l)}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
