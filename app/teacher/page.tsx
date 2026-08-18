import { getSessionUser } from "@/lib/auth";
import { getStudentsOfTeacher, computeOverallStats, getHomeworksForStudent, homeworkStatus } from "@/lib/queries";
import { pluralRu } from "@/lib/pluralize";
import TeacherShell from "@/components/TeacherShell";

export default async function TeacherDashboard() {
  const user = (await getSessionUser())!;
  const students = await getStudentsOfTeacher(user.id);

  const cards = await Promise.all(
    students.map(async (s) => {
      const [stats, homeworks] = await Promise.all([
        computeOverallStats(s.id),
        getHomeworksForStudent(s.id),
      ]);
      const statuses = await Promise.all(homeworks.map((h) => homeworkStatus(h, s.id)));
      const pendingCount = statuses.filter((st) => !st.complete).length;
      const overdue = statuses.some((st) => !st.complete && st.overdue);
      return { s, stats, pendingCount, overdue };
    })
  );

  return (
    <TeacherShell active="students" title="Мои ученики">
      <main className="mx-auto max-w-3xl px-4 pt-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-black text-ink">Мои ученики</h1>
            <p className="mt-1 text-sm text-ink-soft">
              {students.length} {pluralRu(students.length, ["ученик", "ученика", "учеников"])}
            </p>
          </div>
          <div className="flex gap-2">
            <a href="/teacher/content" className="btn-secondary">
              Контент программы
            </a>
            <a href="/teacher/students/new" className="btn-primary">
              + Добавить ученика
            </a>
          </div>
        </div>

        <div className="space-y-3">
          {cards.map(({ s, stats, pendingCount, overdue }) => (
            <a
              key={s.id}
              href={`/teacher/student/${s.id}`}
              className="card flex flex-wrap items-center justify-between gap-4 p-4 transition hover:border-pine"
            >
              <div>
                <p className="font-display text-base font-black text-ink">{s.name}</p>
                <p className="mt-0.5 text-xs text-ink-soft">{s.email}</p>
              </div>
              <div className="flex items-center gap-5 text-center">
                <div>
                  <p className="font-mono text-sm font-semibold text-ink">
                    {stats.solvedProblems}/{stats.totalProblems}
                  </p>
                  <p className="text-[11px] text-ink-soft">решено</p>
                </div>
                <div>
                  <p className="font-mono text-sm font-semibold text-ink">{stats.accuracy}%</p>
                  <p className="text-[11px] text-ink-soft">точность</p>
                </div>
                <div>
                  <p
                    className={`font-mono text-sm font-semibold ${
                      overdue ? "text-coral" : "text-ink"
                    }`}
                  >
                    {pendingCount}
                  </p>
                  <p className="text-[11px] text-ink-soft">ДЗ в работе</p>
                </div>
              </div>
            </a>
          ))}
          {students.length === 0 && (
            <div className="card p-8 text-center text-sm text-ink-soft">
              Пока нет учеников. Нажмите «Добавить ученика», чтобы создать первый аккаунт.
            </div>
          )}
        </div>
      </main>
    </TeacherShell>
  );
}
