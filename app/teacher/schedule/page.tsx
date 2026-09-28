import { getSessionUser } from "@/lib/auth";
import { getStudentsOfTeacher, getUpcomingLessonsForTeacher } from "@/lib/queries";
import { pluralRu } from "@/lib/pluralize";
import TeacherShell from "@/components/TeacherShell";
import AddLessonForm from "@/components/AddLessonForm";
import UpcomingLessons from "@/components/UpcomingLessons";
import CollapsibleSection from "@/components/CollapsibleSection";

export default async function SchedulePage() {
  const user = (await getSessionUser())!;
  const [students, lessons] = await Promise.all([
    getStudentsOfTeacher(user.id),
    getUpcomingLessonsForTeacher(user.id),
  ]);

  return (
    <TeacherShell active="schedule" title="Расписание">
      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-black text-ink">Расписание</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {lessons.length > 0
              ? `${lessons.length} ${pluralRu(lessons.length, ["занятие", "занятия", "занятий"])} впереди`
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
            <CollapsibleSection title="Запланировать занятие" defaultOpen={lessons.length === 0}>
              <AddLessonForm students={students.map((s) => ({ id: s.id, name: s.name }))} from="schedule" />
            </CollapsibleSection>

            <div className="mt-6">
              <UpcomingLessons lessons={lessons} showStudent from="schedule" />
            </div>
          </>
        )}
      </main>
    </TeacherShell>
  );
}
