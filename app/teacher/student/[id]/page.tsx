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
  getUpcomingLessonsForStudent,
  getStudentBalance,
  getStudentPayments,
  getMockScores,
  getStudentNotes,
  getWeeklyStats,
} from "@/lib/queries";
import StudentDynamicsSection from "@/components/StudentDynamicsSection";
import { formatDateRu } from "@/lib/money";
import GoalCard from "@/components/GoalCard";
import {
  TargetScoreForm,
  AddMockScoreForm,
  DeleteMockButton,
  StudentNotesForm,
} from "@/components/StudentGoalForms";
import { pluralRu } from "@/lib/pluralize";
import TeacherShell from "@/components/TeacherShell";
import GradeBadge from "@/components/GradeBadge";
import CollapsibleSection from "@/components/CollapsibleSection";
import SkillsProgressSummary from "@/components/SkillsProgressSummary";
import RecentList from "@/components/RecentList";
import AddLessonForm from "@/components/AddLessonForm";
import UpcomingLessons from "@/components/UpcomingLessons";
import AddPaymentForm from "@/components/AddPaymentForm";
import PaymentHistory from "@/components/PaymentHistory";
import BalanceSummary, { balanceLabel } from "@/components/BalanceSummary";
import AddParentForm from "./AddParentForm";
import LessonLogForm from "./LessonLogForm";
import PendingReviewCard from "./PendingReviewCard";
import DeleteStudentButton from "./DeleteStudentButton";

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

  const [
    curriculum,
    progress,
    stats,
    homeworks,
    mistakesRaw,
    lessonLogs,
    pendingReviewsRaw,
    parents,
    upcomingLessons,
    balance,
    payments,
    mocks,
    notesData,
    weekly,
  ] = await Promise.all([
      getCurriculum(),
      computeStudentProgress(student.id),
      computeOverallStats(student.id),
      getHomeworksForStudent(student.id),
      getMistakesForStudent(student.id),
      getLessonLogsForStudent(student.id),
      getPendingReviewsForTeacher(teacher.id),
      getParentsOfStudent(student.id),
      getUpcomingLessonsForStudent(student.id),
      getStudentBalance(teacher.id, student.id),
      getStudentPayments(student.id),
      getMockScores(student.id),
      getStudentNotes(student.id),
      getWeeklyStats(student.id, 12),
    ]);
  const solved12w = weekly.reduce((s, w) => s + w.solved, 0);
  const notesUpdatedLabel = notesData.updatedAt
    ? new Date(notesData.updatedAt).toLocaleString("ru-RU", {
        timeZone: "Europe/Moscow",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  const notesPreview = notesData.notes.trim().split("\n")[0]?.slice(0, 60);
  const hwStatuses = await Promise.all(homeworks.map((h) => homeworkStatus(h, student.id)));
  const mistakes = mistakesRaw.slice(0, 8);
  const pendingReviews = pendingReviewsRaw.filter((r) => r.student.id === student.id);

  return (
    <TeacherShell active="students" title={student.name}>
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

        <div className="mb-4 grid grid-cols-3 gap-3">
          <StatChip label="Решено задач" value={`${stats.solvedProblems}/${stats.totalProblems}`} />
          <StatChip label="Точность ответов" value={`${stats.accuracy}%`} />
          <StatChip label="Активных дней за неделю" value={`${stats.activeDaysLast7}`} />
        </div>

        <GoalCard targetScore={student.targetScore} mocks={mocks} />

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

        <div id="goal" className="scroll-mt-20">
          <CollapsibleSection
            title="Цель и пробники"
            summary={
              mocks.length > 0
                ? `${mocks.length} ${pluralRu(mocks.length, ["пробник", "пробника", "пробников"])}`
                : undefined
            }
            defaultOpen={!student.targetScore}
          >
            <div className="card mb-4 p-4">
              <TargetScoreForm studentId={student.id} targetScore={student.targetScore} />
            </div>
            <div className="mb-4">
              <AddMockScoreForm studentId={student.id} />
            </div>
            {mocks.length > 0 ? (
              <div className="space-y-2">
                {mocks.map((m) => (
                  <div key={m.id} className="card flex items-center gap-3 p-3.5">
                    <span className="min-w-[44px] font-mono text-lg font-bold text-ink">{m.score}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-ink">{formatDateRu(m.takenAt)}</p>
                      {m.note && <p className="truncate text-xs text-ink-soft">{m.note}</p>}
                    </div>
                    <DeleteMockButton mockId={m.id} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="card p-6 text-center text-sm text-ink-soft">Пробников пока не записано.</div>
            )}
          </CollapsibleSection>
        </div>

        <CollapsibleSection title="Заметки" summary={notesPreview || undefined}>
          <StudentNotesForm
            studentId={student.id}
            notes={notesData.notes}
            updatedLabel={notesUpdatedLabel}
          />
        </CollapsibleSection>

        <CollapsibleSection
          title="Динамика"
          summary={`${solved12w} ${pluralRu(solved12w, ["задача", "задачи", "задач"])} за 12 недель`}
          defaultOpen
        >
          <StudentDynamicsSection weekly={weekly} mocks={mocks} targetScore={student.targetScore} />
        </CollapsibleSection>

        <CollapsibleSection
          title="Прогресс по навыкам"
          summary={`${stats.solvedProblems}/${stats.totalProblems} задач`}
        >
          <SkillsProgressSummary curriculum={curriculum} progress={progress} />
        </CollapsibleSection>

        <CollapsibleSection
          title="Разбор ошибок"
          summary={mistakes.length > 0 ? `${mistakes.length} ${pluralRu(mistakes.length, ["ошибка", "ошибки", "ошибок"])}` : undefined}
        >
          <RecentList
            limit={4}
            emptyText="Пока нет зафиксированных ошибок — отлично!"
            items={mistakes.map((m) => (
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
          />
        </CollapsibleSection>

        <CollapsibleSection
          title="Задания"
          summary={homeworks.length > 0 ? `${homeworks.length} ${pluralRu(homeworks.length, ["задание", "задания", "заданий"])}` : undefined}
          defaultOpen
        >
          <RecentList
            limit={4}
            emptyText="Пока нет назначенных заданий."
            items={homeworks.map((hw, i) => {
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
                  <GradeBadge solved={st.done} total={st.total} size="sm" showFraction />
                </div>
              );
            })}
          />
        </CollapsibleSection>

        <CollapsibleSection
          title="Расписание занятий"
          summary={upcomingLessons.length > 0 ? `${upcomingLessons.length} ${pluralRu(upcomingLessons.length, ["занятие", "занятия", "занятий"])} впереди` : undefined}
        >
          <div className="mb-4">
            <UpcomingLessons lessons={upcomingLessons} showStudent={false} from="student" />
          </div>
          <AddLessonForm studentId={student.id} from="student" />
        </CollapsibleSection>

        <CollapsibleSection
          title="Оплаты"
          summary={balance ? balanceLabel(balance.balance) : undefined}
          defaultOpen={!!balance && balance.balance < 0}
        >
          {balance && <BalanceSummary balance={balance} />}
          <div className="mb-4">
            <AddPaymentForm studentId={student.id} />
          </div>
          <PaymentHistory payments={payments} showStudent={false} from="student" />
        </CollapsibleSection>

        <CollapsibleSection
          title="Журнал занятий"
          summary={lessonLogs.length > 0 ? `${lessonLogs.length} ${pluralRu(lessonLogs.length, ["запись", "записи", "записей"])}` : undefined}
        >
          <div className="mb-4">
            <RecentList
              limit={3}
              emptyText="Занятий пока не записано."
              items={lessonLogs.map((log) => (
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
            />
          </div>
          <LessonLogForm studentId={student.id} />
        </CollapsibleSection>

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

        <section className="mt-8 border-t border-line-soft pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-ink">Удаление ученика</p>
              <p className="mt-0.5 text-xs text-ink-soft">
                Если ученик перестал заниматься — удалите его, чтобы освободить место. Действие необратимо.
              </p>
            </div>
            <DeleteStudentButton studentId={student.id} studentName={student.name} />
          </div>
        </section>
      </main>
    </TeacherShell>
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
