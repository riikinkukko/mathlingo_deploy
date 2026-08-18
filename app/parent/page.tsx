import { getSessionUser } from "@/lib/auth";
import {
  getChildrenOfParent,
  computeOverallStats,
  getHomeworksForStudent,
  homeworkStatus,
} from "@/lib/queries";
import AppHeader from "@/components/AppHeader";

export default async function ParentDashboard() {
  const user = (await getSessionUser())!;
  const children = await getChildrenOfParent(user.id);

  const cards = await Promise.all(
    children.map(async (child) => {
      const [stats, homeworks] = await Promise.all([
        computeOverallStats(child.id),
        getHomeworksForStudent(child.id),
      ]);
      const statuses = await Promise.all(homeworks.map((h) => homeworkStatus(h, child.id)));
      const pendingCount = statuses.filter((s) => !s.complete).length;
      const overdue = statuses.some((s) => !s.complete && s.overdue);
      return { child, stats, pendingCount, overdue };
    })
  );

  return (
    <div className="min-h-screen">
      <AppHeader user={user} />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-black text-ink">Прогресс детей</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Здесь видно, что было пройдено и как выполняется домашка.
          </p>
        </div>

        <div className="space-y-3">
          {cards.map(({ child, stats, pendingCount, overdue }) => (
            <a
              key={child.id}
              href={`/parent/child/${child.id}`}
              className="card flex flex-wrap items-center justify-between gap-4 p-5 transition hover:border-pine"
            >
              <div>
                <p className="font-display text-lg font-black text-ink">{child.name}</p>
                <p className="mt-0.5 text-xs text-ink-soft">{child.email}</p>
              </div>
              <div className="flex items-center gap-6 text-center">
                <div>
                  <p className="font-mono text-base font-semibold text-ink">
                    {stats.solvedProblems}/{stats.totalProblems}
                  </p>
                  <p className="text-[11px] text-ink-soft">задач решено</p>
                </div>
                <div>
                  <p className="font-mono text-base font-semibold text-ink">{stats.accuracy}%</p>
                  <p className="text-[11px] text-ink-soft">точность</p>
                </div>
                <div>
                  <p className={`font-mono text-base font-semibold ${overdue ? "text-coral" : "text-ink"}`}>
                    {pendingCount}
                  </p>
                  <p className="text-[11px] text-ink-soft">ДЗ в работе</p>
                </div>
              </div>
            </a>
          ))}
          {children.length === 0 && (
            <div className="card p-8 text-center text-sm text-ink-soft">
              Пока нет привязанных детей. Обратитесь к репетитору, чтобы он добавил вас в аккаунт ученика.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
