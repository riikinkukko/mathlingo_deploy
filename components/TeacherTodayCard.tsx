import { setLessonStatusAction } from "@/app/actions-schedule";
import { pluralRu } from "@/lib/pluralize";
import type { ScheduledLessonWithStudent } from "@/lib/types";
import { collapseGroupLessons, groupTitle } from "@/lib/lesson-collapse";
import { lessonTimeRange, mskClock } from "@/lib/lesson-time";
import GroupLessonActions from "./GroupLessonActions";

function untilLabel(iso: string, now: number) {
  const min = Math.round((new Date(iso).getTime() - now) / 60000);
  if (min < 60) return `через ${min} мин`;
  const h = Math.round(min / 60);
  return `через ${h} ${pluralRu(h, ["час", "часа", "часов"])}`;
}

/**
 * «Сегодня» — первая карточка кабинета репетитора: занятия дня. У начавшихся
 * и прошедших неотмеченных — кнопки «Было / Не было» прямо в списке (без
 * перехода в расписание). Остальные показывают, через сколько начнутся.
 */
export default function TeacherTodayCard({
  lessons,
  dateLabel,
}: {
  lessons: ScheduledLessonWithStudent[];
  dateLabel: string;
}) {
  const now = Date.now();
  const items = collapseGroupLessons(lessons);
  return (
    <section className="mb-4 rounded-[24px] bg-pine-darker p-4 text-white">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[17px] font-black">
          {items.length > 0
            ? `${items.length} ${pluralRu(items.length, ["занятие", "занятия", "занятий"])} сегодня`
            : "Сегодня занятий нет"}
        </h2>
        <span className="text-[12px] font-bold text-pine-mint">{dateLabel}</span>
      </div>

      {items.length === 0 ? (
        <a
          href="/teacher/schedule"
          className="mt-3 flex min-h-[44px] items-center justify-center rounded-2xl bg-white/10 text-sm font-extrabold text-white"
        >
          Запланировать занятие →
        </a>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((l) => {
            const started = new Date(l.startsAt).getTime() <= now;
            const needsMark = l.status === "planned" && started;
            return (
              <li
                key={l.id}
                className={`rounded-2xl p-3 ${needsMark ? "bg-white text-ink" : "bg-white/10 text-white"}`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-[52px] shrink-0 leading-tight" title={lessonTimeRange(l.startsAt, l.durationMin)}>
                    <span className="block font-display text-[15px] font-black">{mskClock(l.startsAt)}</span>
                    <span className={`block text-[11px] font-bold ${needsMark ? "text-ink-soft" : "text-pine-mint"}`}>
                      –{mskClock(new Date(new Date(l.startsAt).getTime() + l.durationMin * 60000))}
                    </span>
                  </span>
                  <a
                    href={l.members && l.groupId ? `/teacher/groups/${l.groupId}` : `/teacher/student/${l.studentId}`}
                    className="min-w-0 flex-1"
                  >
                    <span className="block truncate text-[15px] font-extrabold">
                      {l.members ? `👥 ${groupTitle(l.groupName)}` : l.studentName}
                    </span>
                    {l.members && (
                      <span className={`block truncate text-[12px] ${needsMark ? "text-ink-soft" : "text-pine-mint"}`}>
                        {l.members.map((m) => m.studentName.split(" ")[0]).join(", ")}
                      </span>
                    )}
                    <span className={`block truncate text-[12px] ${needsMark ? "text-ink-soft" : "text-pine-mint"}`}>
                      {l.topic || "Тема не указана"}
                      {l.status === "planned" && !started ? ` · ${untilLabel(l.startsAt, now)}` : ""}
                    </span>
                  </a>
                  {l.status === "done" && (
                    <span className="shrink-0 rounded-pill bg-white/15 px-2.5 py-1 text-[11px] font-black">✓ было</span>
                  )}
                  {needsMark && (
                    <span className="shrink-0 rounded-pill bg-amber-light px-2 py-0.5 text-[11px] font-black text-amber-dark">
                      отметить
                    </span>
                  )}
                </div>
                {needsMark && l.members && l.groupLessonId && (
                  <div className="mt-2.5 flex">
                    <GroupLessonActions groupLessonId={l.groupLessonId} members={l.members} from="home" tone="dark" past />
                  </div>
                )}
                {needsMark && !l.members && (
                  <div className="mt-2.5 grid grid-cols-2 gap-2">
                    <form action={setLessonStatusAction}>
                      <input type="hidden" name="lessonId" value={l.id} />
                      <input type="hidden" name="status" value="done" />
                      <input type="hidden" name="from" value="home" />
                      <button type="submit" className="h-11 w-full rounded-xl bg-pine-dark text-[15px] font-black text-white">
                        Было
                      </button>
                    </form>
                    <form action={setLessonStatusAction}>
                      <input type="hidden" name="lessonId" value={l.id} />
                      <input type="hidden" name="status" value="cancelled" />
                      <input type="hidden" name="from" value="home" />
                      <button
                        type="submit"
                        className="h-11 w-full rounded-xl border-2 border-line bg-white text-[15px] font-extrabold text-ink-soft"
                      >
                        Не было
                      </button>
                    </form>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
