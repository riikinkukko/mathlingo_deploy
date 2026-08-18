import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import {
  getCurriculum,
  computeStudentProgress,
  computeOverallStats,
  getHomeworksForStudent,
  homeworkStatus,
  getUserById,
  getLessonLogsForStudent,
  isParentOf,
} from "@/lib/queries";
import ParentShell from "@/components/ParentShell";
import FractionBadge from "@/components/FractionBadge";

const KIND_LABEL: Record<string, string> = {
  homework: "Домашка",
  test: "Контрольная",
  exam: "Пробник",
};

export default async function ChildDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const parent = (await getSessionUser())!;
  const isMyChild = await isParentOf(parent.id, params.id);
  const child = await getUserById(params.id);
  if (!child || !isMyChild) notFound();

  const curriculum = await getCurriculum();
  const progress = await computeStudentProgress(child.id);
  const stats = await computeOverallStats(child.id);
  const homeworks = await getHomeworksForStudent(child.id);
  const lessonLogs = await getLessonLogsForStudent(child.id);
  const teacher = child.teacherId ? await getUserById(child.teacherId) : undefined;
  const homeworkStatuses = await Promise.all(
    homeworks.map(async (hw) => [hw.id, await homeworkStatus(hw, child.id)] as const)
  );
  const statusById = new Map(homeworkStatuses);

  return (
    <ParentShell title={child.name}>
      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-black text-ink">{child.name}</h1>
          {teacher && <p className="mt-1 text-sm text-ink-soft">Репетитор: {teacher.name}</p>}
        </div>

        <div className="mb-8 grid grid-cols-3 gap-3">
          <StatChip label="Решено задач" value={`${stats.solvedProblems}/${stats.totalProblems}`} />
          <StatChip label="Точность ответов" value={`${stats.accuracy}%`} />
          <StatChip label="Активных дней за неделю" value={`${stats.activeDaysLast7}`} />
        </div>

        <section className="mb-8">
          <h2 className="mb-3 font-display text-lg font-black text-ink">Журнал занятий</h2>
          {lessonLogs.length === 0 ? (
            <p className="text-sm text-ink-soft">Репетитор пока не оставил записей о занятиях.</p>
          ) : (
            <div className="space-y-3">
              {lessonLogs.map((log) => (
                <div key={log.id} className="card p-4">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="font-display text-base font-black text-ink">{log.topic}</p>
                    <p className="text-xs font-bold text-ink-soft">
                      {new Date(log.date).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
                    </p>
                  </div>
                  <p className="text-sm leading-relaxed text-ink-soft">{log.report}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mb-8">
          <h2 className="mb-3 font-display text-lg font-black text-ink">Прогресс по навыкам</h2>
          <div className="space-y-2">
            {curriculum
              .flatMap((t) => t.chapters)
              .flatMap(({ chapter, skills }) => skills.map((s) => ({ chapter, skill: s })))
              .map(({ chapter, skill }) => {
                const p = progress[skill.id] || { solved: 0, total: 0, pct: 0 };
                return (
                  <div key={skill.id} className="card flex items-center gap-4 p-3.5">
                    <div className="w-48 shrink-0">
                      <p className="text-sm font-medium text-ink">{skill.title}</p>
                      <p className="text-[11px] text-ink-soft">{chapter.title}</p>
                    </div>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-grid">
                      <div className="h-full origin-left animate-grow-x bg-pine" style={{ width: `${p.pct}%` }} />
                    </div>
                    <FractionBadge solved={p.solved} total={p.total} size="sm" />
                  </div>
                );
              })}
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-display text-lg font-black text-ink">Задания</h2>
          {homeworks.length === 0 ? (
            <p className="text-sm text-ink-soft">Пока нет назначенных заданий.</p>
          ) : (
            <div className="space-y-2">
              {homeworks.map((hw) => {
                const st = statusById.get(hw.id)!;
                return (
                  <div key={hw.id} className="card flex items-center justify-between p-3.5">
                    <div>
                      <p className="text-[10px] font-extrabold uppercase text-ink-soft">
                        {KIND_LABEL[hw.kind] ?? "Задание"}
                      </p>
                      <p className="text-sm font-semibold text-ink">{hw.title}</p>
                      <p className="text-xs text-ink-soft">
                        Срок: {new Date(hw.dueDate).toLocaleDateString("ru-RU")}
                        {st.overdue && <span className="ml-2 text-coral">просрочено</span>}
                        {st.complete && <span className="ml-2 text-pine">выполнено</span>}
                      </p>
                    </div>
                    <FractionBadge solved={st.done} total={st.total} size="sm" />
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </ParentShell>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-4 py-3 text-center">
      <p className="font-mono text-lg font-semibold leading-none text-ink">{value}</p>
      <p className="mt-1 text-[11px] text-ink-soft">{label}</p>
    </div>
  );
}
