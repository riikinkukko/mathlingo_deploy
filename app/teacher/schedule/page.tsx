import { getSessionUser } from "@/lib/auth";
import {
  getStudentsOfTeacher,
  getUpcomingLessonsForTeacher,
  getUnmarkedPastLessons,
  getScheduledLessonById,
  getLessonsForTeacherRange,
} from "@/lib/queries";
import WeekSchedule, { WeekDay, WeekItem } from "@/components/WeekSchedule";
import { collapseGroupLessons, groupTitle } from "@/lib/lesson-collapse";
import { addDaysKey, lessonTimeRange, mondayOf, mskDayKey, mskDayStart, mskMinutes } from "@/lib/lesson-time";
import LessonDoneBanner from "@/components/LessonDoneBanner";
import { pluralRu } from "@/lib/pluralize";
import TeacherShell from "@/components/TeacherShell";
import AddLessonForm from "@/components/AddLessonForm";
import UpcomingLessons from "@/components/UpcomingLessons";
import CollapsibleSection from "@/components/CollapsibleSection";
import { countDistinctLessons, getGroupsOfTeacher } from "@/lib/groups";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: { done?: string; view?: string; week?: string };
}) {
  // По умолчанию — сетка на неделю; «Список» — прежняя лента занятий.
  const view = searchParams.view === "list" ? "list" : "week";
  const todayKey = mskDayKey(new Date());
  const weekKey = mondayOf(/^\d{4}-\d{2}-\d{2}$/.test(searchParams.week ?? "") ? searchParams.week! : todayKey);
  const user = (await getSessionUser())!;
  // ?done=<id> — только что отмеченное «Провести/Было» занятие: предлагаем отчёт.
  const doneLesson = searchParams.done ? await getScheduledLessonById(searchParams.done) : undefined;
  const showDone = doneLesson && doneLesson.teacherId === user.id && doneLesson.status === "done";
  const [students, lessons, unmarked, groups, weekRows] = await Promise.all([
    getStudentsOfTeacher(user.id),
    // С еженедельными сериями занятий много — берём с запасом, показываем 30.
    getUpcomingLessonsForTeacher(user.id, 200),
    getUnmarkedPastLessons(user.id),
    getGroupsOfTeacher(user.id),
    view === "week"
      ? getLessonsForTeacherRange(user.id, mskDayStart(weekKey), mskDayStart(addDaysKey(weekKey, 7)))
      : Promise.resolve([]),
  ]);
  const week = view === "week" ? buildWeek(weekRows, weekKey, todayKey) : null;
  const upcomingCount = countDistinctLessons(lessons);
  const unmarkedCount = countDistinctLessons(unmarked);

  return (
    <TeacherShell active="schedule" title="Расписание">
      <main className={`mx-auto px-4 py-6 ${view === "week" ? "max-w-5xl" : "max-w-3xl"}`}>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="sr-only lg:not-sr-only font-display text-2xl font-black text-ink">Расписание</h1>
            <p className="mt-1 text-sm text-ink-soft">
              {upcomingCount > 0
                ? `${upcomingCount} ${pluralRu(upcomingCount, ["занятие", "занятия", "занятий"])} впереди`
                : "Ближайшие занятия со всеми учениками"}
            </p>
          </div>
          <nav aria-label="Вид расписания" className="flex rounded-2xl bg-line-soft p-1">
            {(
              [
                ["week", "Неделя", `/teacher/schedule?week=${weekKey}`],
                ["list", "Список", "/teacher/schedule?view=list"],
              ] as const
            ).map(([key, label, href]) => (
              <a
                key={key}
                href={href}
                aria-current={view === key ? "page" : undefined}
                className={`flex h-10 items-center rounded-xl px-4 text-[14px] ${
                  view === key ? "bg-white font-black text-ink shadow-soft" : "font-bold text-ink-soft"
                }`}
              >
                {label}
              </a>
            ))}
          </nav>
        </div>

        {students.length === 0 ? (
          <div className="card p-8 text-center text-sm text-ink-soft">
            Сначала добавьте учеников — тогда сможете планировать занятия.
            <div className="mt-4">
              <a href="/teacher/students/new" className="btn-primary">
                + Добавить ученика
              </a>
            </div>
          </div>
        ) : (
          <>
            {showDone && (
              <LessonDoneBanner
                lesson={doneLesson}
                studentName={students.find((st) => st.id === doneLesson.studentId)?.name}
              />
            )}

            {unmarked.length > 0 && (
              <section className="mb-6 rounded-card border-2 border-amber/40 bg-amber-light/30 p-4">
                <h2 className="font-display text-lg font-black text-ink">
                  Отметьте прошедшие занятия ({unmarkedCount})
                </h2>
                <p className="mb-3 mt-0.5 text-xs text-ink-soft">
                  Время этих занятий прошло, но они не отмечены. От «Было» зависит баланс оплат ученика.
                </p>
                <UpcomingLessons lessons={unmarked} showStudent from="schedule" past />
              </section>
            )}

            {week && (
              <div className="mb-6">
                <WeekSchedule {...week} />
              </div>
            )}

            <CollapsibleSection title="Запланировать занятие" defaultOpen={lessons.length === 0}>
              <AddLessonForm
                students={[...students].sort((a, b) => a.name.localeCompare(b.name, "ru")).map((s) => ({ id: s.id, name: s.name }))}
                groups={groups.map((g) => ({ id: g.id, name: g.name, count: g.members.length }))}
                from="schedule"
              />
              {groups.length === 0 && students.length >= 2 && (
                <p className="mt-2 text-[13px] text-ink-soft">
                  Ведёте группу? <a href="/teacher/groups" className="font-bold text-pine-dark">Создайте группу</a> — и
                  планируйте занятие сразу для всех.
                </p>
              )}
            </CollapsibleSection>

            {view === "list" && (
              <div className="mt-6">
                <UpcomingLessons lessons={lessons} showStudent from="schedule" limit={30} />
              </div>
            )}
          </>
        )}
      </main>
    </TeacherShell>
  );
}

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

/** Данные для сетки: 7 дней, занятия группы свёрнуты, пересечения — в «дорожки». */
function buildWeek(rows: Awaited<ReturnType<typeof getLessonsForTeacherRange>>, weekKey: string, todayKey: string) {
  const days: WeekDay[] = WEEKDAYS.map((weekday, i) => {
    const key = addDaysKey(weekKey, i);
    const d = new Date(`${key}T12:00:00+03:00`);
    return {
      key,
      weekday,
      dayNum: Number(key.slice(8)),
      fullLabel: d.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", weekday: "long", day: "numeric", month: "long" }),
      isToday: key === todayKey,
      items: [],
    };
  });
  let minH = 9;
  let maxH = 21;
  for (const day of days) {
    const dayRows = rows.filter((r) => mskDayKey(r.startsAt) === day.key);
    const collapsed = collapseGroupLessons(dayRows);
    const items: WeekItem[] = collapsed.map((l) => {
      const startMin = mskMinutes(l.startsAt);
      const endMin = Math.min(24 * 60, startMin + l.durationMin);
      minH = Math.min(minH, Math.floor(startMin / 60));
      maxH = Math.max(maxH, Math.ceil(endMin / 60));
      const title = l.members ? groupTitle(l.groupName) : l.studentName;
      return {
        id: l.id,
        startsAt: l.startsAt,
        durationMin: l.durationMin,
        startMin,
        endMin,
        title,
        shortTitle: l.members ? l.groupName ?? "Группа" : l.studentName.split(" ")[0],
        topic: l.topic,
        status: l.status,
        seriesId: l.seriesId,
        studentId: l.studentId,
        groupId: l.groupId,
        groupLessonId: l.groupLessonId,
        members: l.members,
        timeRange: lessonTimeRange(l.startsAt, l.durationMin),
        lane: 0,
        lanes: 1,
      };
    });
    // Пересекающиеся по времени занятия делят ширину колонки.
    items.sort((a, b) => a.startMin - b.startMin);
    let cluster: WeekItem[] = [];
    let clusterEnd = -1;
    const flush = () => {
      const laneEnds: number[] = [];
      for (const it of cluster) {
        let lane = laneEnds.findIndex((e) => e <= it.startMin);
        if (lane === -1) lane = laneEnds.length;
        laneEnds[lane] = it.endMin;
        it.lane = lane;
      }
      for (const it of cluster) it.lanes = laneEnds.length;
      cluster = [];
    };
    for (const it of items) {
      if (cluster.length && it.startMin >= clusterEnd) flush();
      cluster.push(it);
      clusterEnd = Math.max(clusterEnd, it.endMin);
    }
    flush();
    day.items = items;
  }
  const fmt = (key: string, withMonth: boolean) =>
    new Date(`${key}T12:00:00+03:00`).toLocaleDateString("ru-RU", {
      timeZone: "Europe/Moscow",
      day: "numeric",
      ...(withMonth ? { month: "long" } : {}),
    });
  const endKey = addDaysKey(weekKey, 6);
  const sameMonth = weekKey.slice(5, 7) === endKey.slice(5, 7);
  return {
    days,
    hourFrom: Math.max(0, minH),
    hourTo: Math.min(24, maxH),
    weekLabel: `${fmt(weekKey, !sameMonth)} – ${fmt(endKey, true)}`,
    prevHref: `/teacher/schedule?week=${addDaysKey(weekKey, -7)}`,
    nextHref: `/teacher/schedule?week=${addDaysKey(weekKey, 7)}`,
    todayHref: "/teacher/schedule",
    isCurrentWeek: weekKey === mondayOf(todayKey),
    nowMin: mskMinutes(new Date()),
  };
}
