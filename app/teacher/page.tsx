import { getSessionUser } from "@/lib/auth";
import { getStudentsOfTeacher, computeOverallStats, getHomeworksForStudent, homeworkStatus, isTeacherEffectivelyPro, getPendingReviewsForTeacher } from "@/lib/queries";
import { pluralRu } from "@/lib/pluralize";
import TeacherShell from "@/components/TeacherShell";
import TeacherDayPanel, { DayPanelData } from "@/components/TeacherDayPanel";
import VerifyEmailReminder from "@/components/VerifyEmailReminder";

const FREE_STUDENT_LIMIT = 3;
// Через сколько дней без активности ученик считается "потерявшимся".
const INACTIVE_DAYS = 3;

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 3600 * 1000));
}

export default async function TeacherDashboard() {
  const user = (await getSessionUser())!;
  const students = await getStudentsOfTeacher(user.id);
  const isOwner = !!user.isPlatformOwner;
  const isPro = isTeacherEffectivelyPro(user);

  const [cards, pendingReviews] = await Promise.all([
    Promise.all(
      students.map(async (s) => {
        const [stats, homeworks] = await Promise.all([
          computeOverallStats(s.id),
          getHomeworksForStudent(s.id),
        ]);
        const statuses = await Promise.all(homeworks.map((h) => homeworkStatus(h, s.id)));
        const pendingCount = statuses.filter((st) => !st.complete).length;
        const overdueCount = statuses.filter((st) => !st.complete && st.overdue).length;
        return { s, stats, pendingCount, overdue: overdueCount > 0, overdueCount };
      })
    ),
    getPendingReviewsForTeacher(user.id),
  ]);

  // Сводка для "панели дня".
  const panelData: DayPanelData = {
    reviewsCount: pendingReviews.length,
    overdue: cards
      .filter((c) => c.overdueCount > 0)
      .map((c) => ({ id: c.s.id, name: c.s.name, count: c.overdueCount })),
    inactive: cards
      .map((c) => {
        // сколько дней назад заходил; если ни разу — считаем от создания аккаунта
        const ref = c.stats.lastActiveAt ?? c.s.createdAt;
        const days = c.stats.lastActiveAt ? daysSince(c.stats.lastActiveAt) : null;
        const idleDays = daysSince(ref);
        return { id: c.s.id, name: c.s.name, days, idleDays };
      })
      .filter((x) => x.idleDays >= INACTIVE_DAYS)
      .map(({ id, name, days }) => ({ id, name, days })),
  };

  return (
    <TeacherShell active="students" title="Мои ученики">
      <main className="mx-auto max-w-3xl px-4 pt-6">
        {!user.emailVerifiedAt && (
          <VerifyEmailReminder
            reason={
              !isOwner && !isPro
                ? "Подтвердите email — без этого на бесплатном тарифе нельзя добавлять учеников."
                : undefined
            }
          />
        )}
        {students.length > 0 && <TeacherDayPanel data={panelData} />}

        {!isOwner && !isPro && (
          <a
            href="/teacher/upgrade"
            className={`card mb-4 flex items-center justify-between p-3.5 transition hover:border-pine ${
              students.length >= FREE_STUDENT_LIMIT ? "border-2 !border-amber bg-amber-light/40" : ""
            }`}
          >
            <p className="text-sm font-semibold text-ink">
              Тариф: <span className="font-bold text-pine-dark">Free</span> ·{" "}
              {students.length}/{FREE_STUDENT_LIMIT} учеников
            </p>
            <span className="text-xs font-bold text-pine">Подробнее →</span>
          </a>
        )}

        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-black text-ink">Мои ученики</h1>
            <p className="mt-1 text-sm text-ink-soft">
              {students.length} {pluralRu(students.length, ["ученик", "ученика", "учеников"])}
            </p>
          </div>
          <div className="flex gap-2">
            {(isOwner || user.isAdmin) && (
              <a href="/teacher/content" className="btn-secondary">
                Контент программы
              </a>
            )}
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
