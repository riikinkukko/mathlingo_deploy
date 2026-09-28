import { setLessonStatusAction, deleteLessonAction } from "@/app/actions-schedule";
import { ScheduledLesson } from "@/lib/types";

type LessonItem = ScheduledLesson & { studentName?: string };

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

function timeLabel(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: MSK,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default function UpcomingLessons({
  lessons,
  showStudent,
  from,
  emptyText = "Занятий пока не запланировано.",
}: {
  lessons: LessonItem[];
  showStudent: boolean;
  from: "student" | "schedule";
  emptyText?: string;
}) {
  if (lessons.length === 0) {
    return <div className="card p-6 text-center text-sm text-ink-soft">{emptyText}</div>;
  }

  // Группируем по дню (лента уже отсортирована по возрастанию времени).
  const groups: { key: string; label: string; items: LessonItem[] }[] = [];
  for (const l of lessons) {
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
              <div key={l.id} className="card flex flex-wrap items-center gap-3 p-3.5">
                <div className="flex min-w-[64px] flex-col items-center rounded-xl bg-pine-light/40 px-2.5 py-1.5">
                  <span className="font-mono text-sm font-bold text-pine-dark">{timeLabel(l.startsAt)}</span>
                  <span className="text-[10px] text-ink-soft">{l.durationMin} мин</span>
                </div>
                <div className="min-w-0 flex-1">
                  {showStudent && l.studentName && (
                    <p className="font-display text-sm font-black text-ink">{l.studentName}</p>
                  )}
                  <p className="truncate text-sm text-ink-soft">
                    {l.topic || <span className="italic">Тема не указана</span>}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <form action={setLessonStatusAction}>
                    <input type="hidden" name="lessonId" value={l.id} />
                    <input type="hidden" name="status" value="done" />
                    <input type="hidden" name="from" value={from} />
                    <button
                      type="submit"
                      className="rounded-pill bg-pine px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-pine-dark"
                    >
                      Провести
                    </button>
                  </form>
                  <form action={setLessonStatusAction}>
                    <input type="hidden" name="lessonId" value={l.id} />
                    <input type="hidden" name="status" value="cancelled" />
                    <input type="hidden" name="from" value={from} />
                    <button
                      type="submit"
                      className="rounded-pill bg-line-soft px-2.5 py-1 text-[11px] font-bold text-ink-soft transition hover:bg-line"
                    >
                      Отменить
                    </button>
                  </form>
                  <form action={deleteLessonAction}>
                    <input type="hidden" name="lessonId" value={l.id} />
                    <input type="hidden" name="from" value={from} />
                    <button
                      type="submit"
                      aria-label="Удалить занятие"
                      className="rounded-pill px-2 py-1 text-[11px] font-bold text-coral transition hover:bg-coral-light"
                    >
                      ✕
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
