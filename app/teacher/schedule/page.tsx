import { getSessionUser } from "@/lib/auth";
import {
  getStudentsOfTeacher,
  getUpcomingLessonsForTeacher,
  getUnmarkedPastLessons,
  getScheduledLessonById,
} from "@/lib/queries";
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
  searchParams: { done?: string };
}) {
  const user = (await getSessionUser())!;
  // ?done=<id> — только что отмеченное «Провести/Было» занятие: предлагаем отчёт.
  const doneLesson = searchParams.done ? await getScheduledLessonById(searchParams.done) : undefined;
  const showDone = doneLesson && doneLesson.teacherId === user.id && doneLesson.status === "done";
  const [students, lessons, unmarked, groups] = await Promise.all([
    getStudentsOfTeacher(user.id),
    // С еженедельными сериями занятий много — берём с запасом, показываем 30.
    getUpcomingLessonsForTeacher(user.id, 200),
    getUnmarkedPastLessons(user.id),
    getGroupsOfTeacher(user.id),
  ]);
  const upcomingCount = countDistinctLessons(lessons);
  const unmarkedCount = countDistinctLessons(unmarked);

  return (
    <TeacherShell active="schedule" title="Расписание">
      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-6">
          <h1 className="sr-only lg:not-sr-only font-display text-2xl font-black text-ink">Расписание</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {upcomingCount > 0
              ? `${upcomingCount} ${pluralRu(upcomingCount, ["занятие", "занятия", "занятий"])} впереди`
              : "Ближайшие занятия со всеми учениками"}
          </p>
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

            <div className="mt-6">
              <UpcomingLessons lessons={lessons} showStudent from="schedule" limit={30} />
            </div>
          </>
        )}
      </main>
    </TeacherShell>
  );
}
