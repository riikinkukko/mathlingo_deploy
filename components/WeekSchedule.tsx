"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { setLessonStatusAction } from "@/app/actions-schedule";
import GroupLessonActions from "./GroupLessonActions";
import LessonDeleteControl from "./LessonDeleteControl";
import type { LessonMember } from "@/lib/lesson-collapse";
import { pluralRu } from "@/lib/pluralize";

export interface WeekItem {
  id: string;
  startsAt: string;
  durationMin: number;
  startMin: number;
  endMin: number;
  title: string;
  shortTitle: string;
  topic: string | null;
  status: "planned" | "done" | "cancelled";
  seriesId: string | null;
  studentId: string;
  groupId: string | null;
  groupLessonId: string | null;
  members?: LessonMember[];
  timeRange: string;
  lane: number;
  lanes: number;
}

export interface WeekDay {
  key: string;
  weekday: string; // «Пн»
  dayNum: number;
  fullLabel: string; // «понедельник, 5 октября»
  isToday: boolean;
  items: WeekItem[];
}

const HOUR_PX = 48;

export default function WeekSchedule({
  days,
  hourFrom,
  hourTo,
  weekLabel,
  prevHref,
  nextHref,
  todayHref,
  isCurrentWeek,
  nowMin,
}: {
  days: WeekDay[];
  hourFrom: number;
  hourTo: number;
  weekLabel: string;
  prevHref: string;
  nextHref: string;
  todayHref: string;
  isCurrentWeek: boolean;
  /** минуты от полуночи по Москве — для красной линии «сейчас» */
  nowMin: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<{ item: WeekItem; day: WeekDay } | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hours = Array.from({ length: hourTo - hourFrom }, (_, i) => hourFrom + i);
  const total = days.reduce((n, d) => n + d.items.length, 0);

  // Закрыть карточку занятия по Esc.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const now = Date.now();

  return (
    <section aria-label="Расписание на неделю">
      <div className="mb-3 flex items-center gap-2">
        <a
          href={prevHref}
          aria-label="Предыдущая неделя"
          className="flex h-11 w-11 items-center justify-center rounded-2xl border border-line-soft bg-white text-ink-soft"
        >
          ‹
        </a>
        <div className="min-w-0 flex-1 text-center">
          <p className="font-display text-[16px] font-black text-ink">{weekLabel}</p>
          <p className="text-[12px] text-ink-soft">
            {total ? `${total} ${pluralRu(total, ["занятие", "занятия", "занятий"])}` : "Занятий нет"}
          </p>
        </div>
        <a
          href={nextHref}
          aria-label="Следующая неделя"
          className="flex h-11 w-11 items-center justify-center rounded-2xl border border-line-soft bg-white text-ink-soft"
        >
          ›
        </a>
      </div>
      {!isCurrentWeek && (
        <div className="mb-3 text-center">
          <a href={todayHref} className="text-[13px] font-extrabold text-pine-dark">
            ← К текущей неделе
          </a>
        </div>
      )}

      <div
        className="overflow-hidden rounded-[20px] border border-line-soft bg-white"
        onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchEnd={(e) => {
          const t = touch.current;
          touch.current = null;
          if (!t) return;
          const dx = e.changedTouches[0].clientX - t.x;
          const dy = e.changedTouches[0].clientY - t.y;
          // Смахивание влево/вправо — соседняя неделя.
          if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) router.push(dx < 0 ? nextHref : prevHref);
        }}
      >
        {/* Шапка с днями */}
        <div className="flex border-b border-line-soft">
          <div className="w-8 shrink-0" />
          {days.map((d) => (
            <div key={d.key} className="min-w-0 flex-1 py-1.5 text-center">
              <p className={`text-[11px] font-bold ${d.isToday ? "text-pine-dark" : "text-ink-soft"}`}>{d.weekday}</p>
              <p
                className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full font-display text-[14px] font-black ${
                  d.isToday ? "bg-pine text-white" : "text-ink"
                }`}
              >
                {d.dayNum}
              </p>
            </div>
          ))}
        </div>

        <div ref={scrollRef} className="relative flex" style={{ height: hours.length * HOUR_PX }}>
          {/* Шкала часов */}
          <div className="relative w-8 shrink-0">
            {hours.map((h, i) => (
              <span
                key={h}
                className="absolute right-1 -translate-y-1/2 text-[10px] font-bold text-ink-soft"
                style={{ top: i * HOUR_PX }}
              >
                {i === 0 ? "" : h}
              </span>
            ))}
          </div>
          {/* Линии часов */}
          <div className="pointer-events-none absolute inset-y-0 left-8 right-0">
            {hours.map((h, i) => (
              <div key={h} className="absolute inset-x-0 border-t border-line-soft/70" style={{ top: i * HOUR_PX }} />
            ))}
          </div>

          {days.map((d) => (
            <div key={d.key} className={`relative min-w-0 flex-1 border-l border-line-soft/70 ${d.isToday ? "bg-pine-light/20" : ""}`}>
              {d.isToday && nowMin >= hourFrom * 60 && nowMin <= hourTo * 60 && (
                <div
                  aria-hidden
                  className="absolute inset-x-0 z-10 border-t-2 border-coral"
                  style={{ top: ((nowMin - hourFrom * 60) / 60) * HOUR_PX }}
                />
              )}
              {d.items.map((it) => {
                const top = ((it.startMin - hourFrom * 60) / 60) * HOUR_PX;
                const height = Math.max(22, ((it.endMin - it.startMin) / 60) * HOUR_PX - 2);
                const needsMark = it.status === "planned" && new Date(it.startsAt).getTime() <= now;
                const group = !!it.members;
                const tone =
                  it.status === "done"
                    ? "bg-line-soft text-ink-soft border-line"
                    : needsMark
                      ? "bg-amber-light text-ink border-amber"
                      : group
                        ? "bg-violet-light text-ink border-violet"
                        : "bg-pine-light text-ink border-pine";
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => setOpen({ item: it, day: d })}
                    aria-label={`${it.timeRange}, ${it.title}${it.status === "done" ? ", проведено" : needsMark ? ", нужно отметить" : ""}`}
                    className={`absolute overflow-hidden rounded-lg border-l-[3px] px-[3px] py-0.5 text-left leading-tight shadow-sm ${tone}`}
                    style={{
                      top,
                      height,
                      left: `calc(${(it.lane / it.lanes) * 100}% + 1px)`,
                      width: `calc(${100 / it.lanes}% - 2px)`,
                    }}
                  >
                    {it.lanes > 1 ? (
                      // Узкая «дорожка» (пересечение по времени): только инициал, подробности — по нажатию.
                      <span className="block overflow-hidden text-center text-[11px] font-black">{it.shortTitle.charAt(0)}</span>
                    ) : (
                      <>
                        <span className="block overflow-hidden whitespace-nowrap text-[10px] font-black">
                          {it.timeRange.split("–")[0]}
                        </span>
                        {/* Группу выдаёт цвет блока — значок 👥 на узкой колонке съедал бы имя. */}
                        <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-[10px] font-bold tracking-[-0.01em]">
                          {it.shortTitle}
                        </span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold text-ink-soft">
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-pine" /> ученик</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-violet" /> группа</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-amber" /> отметить</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-line" /> проведено</span>
        <span className="ml-auto lg:hidden">смахните, чтобы листать</span>
      </div>

      {open && (
        <LessonSheet item={open.item} day={open.day} onClose={() => setOpen(null)} />
      )}
    </section>
  );
}

function LessonSheet({ item, day, onClose }: { item: WeekItem; day: WeekDay; onClose: () => void }) {
  const started = new Date(item.startsAt).getTime() <= Date.now();
  const group = !!item.members;
  const href = group && item.groupId ? `/teacher/groups/${item.groupId}` : `/teacher/student/${item.studentId}`;
  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center lg:items-center" role="dialog" aria-label={item.title}>
      <button type="button" aria-label="Закрыть" onClick={onClose} className="absolute inset-0 bg-ink/40" />
      <div className="relative w-full max-w-md rounded-t-[28px] bg-white p-5 pb-[max(20px,env(safe-area-inset-bottom))] lg:rounded-[28px]">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line lg:hidden" />
        <p className="text-[12px] font-extrabold uppercase tracking-wide text-ink-soft">{day.fullLabel}</p>
        <p className="mt-0.5 font-display text-[20px] font-black text-ink">
          {item.timeRange}
          {item.seriesId && <span className="ml-1.5 text-[14px]" title="Регулярное занятие">🔁</span>}
        </p>
        <a href={href} className="mt-1 block font-display text-[17px] font-black text-pine-dark">
          {group ? "👥 " : ""}
          {item.title} →
        </a>
        {group && (
          <p className="text-[13px] text-ink-soft">{item.members!.map((m) => m.studentName).join(", ")}</p>
        )}
        <p className="mt-2 text-[14px] text-ink-soft">{item.topic || <span className="italic">Тема не указана</span>}</p>

        {item.status === "done" ? (
          <p className="mt-4 rounded-2xl bg-pine-light px-4 py-3 text-sm font-extrabold text-pine-dark">✓ Занятие проведено</p>
        ) : (
          <div className="mt-4 flex items-start gap-2">
            {group && item.groupLessonId ? (
              <GroupLessonActions groupLessonId={item.groupLessonId} members={item.members!} from="schedule" past={started} tone="dark" />
            ) : (
              <div className="grid flex-1 grid-cols-2 gap-2">
                <form action={setLessonStatusAction}>
                  <input type="hidden" name="lessonId" value={item.id} />
                  <input type="hidden" name="status" value="done" />
                  <input type="hidden" name="from" value="schedule" />
                  <button type="submit" className="h-11 w-full rounded-xl bg-pine-dark text-[15px] font-black text-white">
                    {started ? "Было" : "Провести"}
                  </button>
                </form>
                <form action={setLessonStatusAction}>
                  <input type="hidden" name="lessonId" value={item.id} />
                  <input type="hidden" name="status" value="cancelled" />
                  <input type="hidden" name="from" value="schedule" />
                  <button type="submit" className="h-11 w-full rounded-xl border-2 border-line bg-white text-[15px] font-extrabold text-ink-soft">
                    {started ? "Не было" : "Отменить"}
                  </button>
                </form>
              </div>
            )}
            <LessonDeleteControl lessonId={item.id} seriesId={item.seriesId} from="schedule" wholeGroup={group} />
          </div>
        )}
      </div>
    </div>
  );
}
