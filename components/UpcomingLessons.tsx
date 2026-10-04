import { setLessonStatusAction } from "@/app/actions-schedule";
import LessonDeleteControl from "./LessonDeleteControl";
import GroupLessonActions from "./GroupLessonActions";
import { ScheduledLesson } from "@/lib/types";
import { pluralRu } from "@/lib/pluralize";
import { collapseGroupLessons, groupTitle } from "@/lib/lesson-collapse";
import { durationLabel, lessonTimeRange } from "@/lib/lesson-time";

type LessonItem = ScheduledLesson & { studentName?: string; groupName?: string | null };

const MSK = "Europe/Moscow";

function dayKey(iso: string): string {
  // YYYY-MM-DD в московском времени — ключ группировки по дням.
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MSK,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return parts;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = dayKey(new Date().toISOString());
  const tomorrow = dayKey(new Date(Date.now() + 24 * 3600 * 1000).toISOString());
  const key = dayKey(iso);
  const base = new Intl.DateTimeFormat("ru-RU", {
    timeZone: MSK,
    weekday: "short",
    day: "numeric",
    month: "long",
  }).format(d);
  if (key === today) return `Сегодня · ${base}`;
  if (key === tomorrow) return `Завтра · ${base}`;
  return base;
}


export default function UpcomingLessons({
  lessons,
  showStudent,
  from,
  emptyText = "Занятий пока не запланировано.",
  limit,
  past = false,
  readOnly = false,
}: {
  lessons: LessonItem[];
  showStudent: boolean;
  from: "student" | "schedule" | "group";
  emptyText?: string;
  /** показать только первые N (остальные — строкой «и ещё N») */
  limit?: number;
  /** прошедшие неотмеченные занятия: подписи «Было / Не было» вместо «Провести / Отменить» */
  past?: boolean;
  /** только просмотр (родитель): без кнопок «Провести / Отменить / удалить» */
  readOnly?: boolean;
}) {
  if (lessons.length === 0) {
    return <div className="card p-6 text-center text-sm text-ink-soft">{emptyText}</div>;
  }
  // В общем расписании строки учеников одного группового занятия
  // сворачиваются в одну карточку. На странице ученика — его строка.
  const items = from === "student" ? lessons.map((l) => ({ ...l, members: undefined })) : collapseGroupLessons(lessons);
  const hiddenCount = limit && items.length > limit ? items.length - limit : 0;
  const shown = hiddenCount ? items.slice(0, limit) : items;

  // Группируем по дню (лента уже отсортирована по возрастанию времени).
  const groups: { key: string; label: string; items: typeof shown }[] = [];
  for (const l of shown) {
    const key = dayKey(l.startsAt);
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, label: dayLabel(l.startsAt), items: [] };
      groups.push(g);
    }
    g.items.push(l);
  }

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.key}>
          <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-ink-soft">{g.label}</p>
          <div className="space-y-2">
            {g.items.map((l) => (
              <div key={l.id} className={`card flex flex-wrap items-center gap-3 p-3.5 ${l.members ? "border-violet-border" : ""}`}>
                <div className={`flex min-w-[96px] flex-col items-center rounded-xl px-2 py-1.5 ${l.members ? "bg-violet-light" : "bg-pine-light/40"}`}>
                  <span className={`whitespace-nowrap font-mono text-[13px] font-bold ${l.members ? "text-violet" : "text-pine-dark"}`}>
                    {lessonTimeRange(l.startsAt, l.durationMin)}
                  </span>
                  <span className="text-[11px] text-ink-soft">
                    {durationLabel(l.durationMin)}
                    {l.seriesId && (
                      <span title="Регулярное занятие (каждую неделю)" aria-label="регулярное"> · 🔁</span>
                    )}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  {l.members ? (
                    <>
                      <p className="font-display text-sm font-black text-ink">
                        {/* на странице группы её название уже в заголовке */}
                        {from === "group" ? l.topic || "Занятие группы" : groupTitle(l.groupName)}
                        <span className="ml-1.5 rounded-pill bg-violet-light px-1.5 py-0.5 align-middle text-[11px] font-black text-violet">
                          {l.members.length}
                        </span>
                      </p>
                      <p className="truncate text-[12px] text-ink-soft">
                        {l.members.map((m) => m.studentName.split(" ")[0]).join(", ")}
                      </p>
                    </>
                  ) : (
                    showStudent &&
                    l.studentName && <p className="font-display text-sm font-black text-ink">{l.studentName}</p>
                  )}
                  {!l.members && l.groupLessonId && (
                    <p className="text-[12px] font-bold text-violet">{groupTitle(l.groupName)}</p>
                  )}
                  {!(l.members && from === "group") && (
                    <p className="line-clamp-2 text-sm text-ink-soft">
                      {l.topic || <span className="italic">Тема не указана</span>}
                    </p>
                  )}
                </div>
                {!readOnly && l.members && l.groupLessonId && (
                  <div className="flex basis-full items-start gap-2 lg:basis-auto lg:shrink-0">
                    <GroupLessonActions
                      groupLessonId={l.groupLessonId}
                      members={l.members}
                      from={from === "group" ? "group" : "schedule"}
                      past={past}
                    />
                    <LessonDeleteControl
                      lessonId={l.id}
                      seriesId={l.seriesId}
                      from={from}
                      wholeGroup
                      reschedule={{ startsAt: l.startsAt, durationMin: l.durationMin, title: groupTitle(l.groupName) }}
                    />
                  </div>
                )}
                {!readOnly && !l.members && (
                <div className="flex basis-full gap-2 lg:basis-auto lg:shrink-0">
                  <form action={setLessonStatusAction} className="flex-1 lg:flex-none">
                    <input type="hidden" name="lessonId" value={l.id} />
                    <input type="hidden" name="status" value="done" />
                    <input type="hidden" name="from" value={from} />
                    <button
                      type="submit"
                      className="h-10 w-full rounded-pill bg-pine px-4 text-[13px] font-extrabold text-white transition hover:bg-pine-dark lg:h-8 lg:w-auto lg:px-3 lg:text-[12px]"
                    >
                      {past ? "✓ Было" : "Провести"}
                    </button>
                  </form>
                  <form action={setLessonStatusAction} className="flex-1 lg:flex-none">
                    <input type="hidden" name="lessonId" value={l.id} />
                    <input type="hidden" name="status" value="cancelled" />
                    <input type="hidden" name="from" value={from} />
                    <button
                      type="submit"
                      className="h-10 w-full rounded-pill bg-line-soft px-4 text-[13px] font-extrabold text-ink-soft transition hover:bg-line lg:h-8 lg:w-auto lg:px-3 lg:text-[12px]"
                    >
                      {past ? "Не было" : "Отменить"}
                    </button>
                  </form>
                  {past && (
                    <form action={setLessonStatusAction} className="flex-1 lg:flex-none">
                      <input type="hidden" name="lessonId" value={l.id} />
                      <input type="hidden" name="status" value="missed" />
                      <input type="hidden" name="from" value={from} />
                      <button
                        type="submit"
                        title="Ученик не пришёл без предупреждения"
                        className="h-10 w-full rounded-pill border border-line px-3 text-[13px] font-bold text-ink-soft transition hover:bg-line-soft lg:h-8 lg:w-auto lg:text-[12px]"
                      >
                        Не пришёл
                      </button>
                    </form>
                  )}
                  <LessonDeleteControl
                    lessonId={l.id}
                    seriesId={l.seriesId}
                    from={from}
                    reschedule={{ startsAt: l.startsAt, durationMin: l.durationMin, title: l.studentName }}
                  />
                </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      {hiddenCount > 0 && (
        <p className="text-center text-xs font-semibold text-ink-soft">
          и ещё {hiddenCount} {pluralRu(hiddenCount, ["занятие", "занятия", "занятий"])} дальше
        </p>
      )}
    </div>
  );
}
