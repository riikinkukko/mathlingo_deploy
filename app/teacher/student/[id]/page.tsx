import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import {
  getCurriculum,
  computeStudentProgress,
  computeOverallStats,
  getHomeworksForStudent,
  homeworkStatus,
  getUserById,
  getMistakesForStudent,
  getLessonLogsForStudent,
  getPendingReviewsForTeacher,
  getParentsOfStudent,
} from "@/lib/queries";
import { pluralRu } from "@/lib/pluralize";
import AppHeader from "@/components/AppHeader";
import FractionBadge from "@/components/FractionBadge";
import AddParentForm from "./AddParentForm";
import LessonLogForm from "./LessonLogForm";
import PendingReviewCard from "./PendingReviewCard";

const KIND_LABEL: Record<string, string> = {
  homework: "Домашка",
  test: "Контрольная",
  exam: "Пробник",
};

export default async function StudentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const teacher = (await getSessionUser())!;
  const student = await getUserById(params.id);
  if (!student || student.role !== "STUDENT" || student.teacherId !== teacher.id) {
    notFound();
  }

  const curriculum = await getCurriculum();
  const progress = await computeStudentProgress(student.id);
  const stats = await computeOverallStats(student.id);
  const homeworks = await getHomeworksForStudent(student.id);
  const hwStatuses = await Promise.all(homeworks.map((h) => homeworkStatus(h, student.id)));
  const mistakes = (await getMistakesForStudent(student.id)).slice(0, 8);
  const lessonLogs = await getLessonLogsForStudent(student.id);
  const pendingReviews = (await getPendingReviewsForTeacher(teacher.id)).filter(
    (r) => r.student.id === student.id
  );
  const parents = await getParentsOfStudent(student.id);

  return (
    <div className="min-h-screen pb-16">
      <AppHeader
        user={teacher}
        crumbs={[{ label: "Мои ученики", href: "/teacher" }, { label: student.name }]}
      />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-black text-ink">{student.name}</h1>
            <p className="mt-1 text-sm text-ink-soft">{student.email}</p>
          </div>
          <a href={`/teacher/homework/new?studentId=${student.id}`} className="btn-primary">
            + Задать задание
          </a>
        </div>

        <div className="mb-8 grid grid-cols-3 gap-3">
          <StatChip label="Решено задач" value={`${stats.solvedProblems}/${stats.totalProblems}`} />
          <StatChip label="Точность ответов" value={`${stats.accuracy}%`} />
          <StatChip label="Активных дней за неделю" value={`${stats.activeDaysLast7}`} />
        </div>

        {pendingReviews.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-black text-ink">
              На проверке
              <span className="rounded-pill bg-amber px-2 py-0.5 text-xs text-white">
                {pendingReviews.length}
              </span>
            </h2>
            <div className="space-y-3">
              {pendingReviews.map((r) => (
                <PendingReviewCard key={r.attemptId} review={r} />
              ))}
            </div>
          </section>
        )}

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

        <section className="mb-8">
          <h2 className="mb-3 font-display text-lg font-black text-ink">Разбор ошибок</h2>
          {mistakes.length === 0 ? (
            <p className="text-sm text-ink-soft">Пока нет зафиксированных ошибок — отлично!</p>
          ) : (
            <div className="space-y-2">
              {mistakes.map((m) => (
                <div key={m.problem.id} className="card p-3.5">
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-pill bg-coral-light px-2 py-0.5 text-[11px] font-extrabold text-coral">
                      {m.skillTitle}
                    </span>
                    <span className="text-[11px] text-ink-soft">
                      {m.wrongAttempts} {pluralRu(m.wrongAttempts, ["ошибка", "ошибки", "ошибок"])}
                      {m.resolved ? " · в итоге решено верно" : " · пока не решено"}
                    </span>
                  </div>
                  <p className="text-sm text-ink">{m.problem.text}</p>
                  <p className="mt-1 text-xs text-ink-soft">
                    Последний ответ ученика: <span className="font-mono">{m.lastWrongAnswer}</span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mb-8">
          <h2 className="mb-3 font-display text-lg font-black text-ink">Задания</h2>
          {homeworks.length === 0 ? (
            <p className="text-sm text-ink-soft">Пока нет назначенных заданий.</p>
          ) : (
            <div className="space-y-2">
              {homeworks.map((hw, i) => {
                const st = hwStatuses[i];
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
                      </p>
                    </div>
                    <FractionBadge solved={st.done} total={st.total} size="sm" />
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="mb-8">
          <h2 className="mb-3 font-display text-lg font-black text-ink">Журнал занятий</h2>
          <div className="mb-4 space-y-3">
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
            {lessonLogs.length === 0 && (
              <p className="text-sm text-ink-soft">Занятий пока не записано.</p>
            )}
          </div>
          <LessonLogForm studentId={student.id} />
        </section>

        <section>
          <h2 className="mb-3 font-display text-lg font-black text-ink">Родители</h2>
          {parents.length > 0 && (
            <ul className="mb-4 space-y-1 text-sm text-ink-soft">
              {parents.map((p) => (
                <li key={p.id}>
                  {p.name} — {p.email}
                </li>
              ))}
            </ul>
          )}
          <div className="card p-5">
            <p className="mb-3 text-sm text-ink-soft">
              Пригласите родителя — он сможет следить за прогрессом, журналом занятий и заданиями ученика.
            </p>
            <AddParentForm studentId={student.id} />
          </div>
        </section>
      </main>
    </div>
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
