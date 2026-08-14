import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import {
  getProblem,
  getSkill,
  homeworkStatus,
  toPublicProblem,
  computeProblemStates,
  getOrCreateAssignmentSession,
  isStandaloneStudent,
  getHomeworkById,
} from "@/lib/queries";
import AppHeader from "@/components/AppHeader";
import AssignmentFlow from "@/components/AssignmentFlow";

const KIND_LABEL: Record<string, string> = {
  homework: "Домашнее задание",
  test: "Контрольная работа",
  exam: "Пробный экзамен",
};

export default async function HomeworkPage({ params }: { params: { id: string } }) {
  const user = (await getSessionUser())!;
  const hw = await getHomeworkById(params.id);

  const standalone = isStandaloneStudent(user);
  const isOwnAssignment = hw && hw.studentId === user.id;
  const isAccessiblePublicExam =
    hw && hw.audience === "pro_standalone" && standalone && user.plan === "pro";
  if (!hw || (!isOwnAssignment && !isAccessiblePublicExam)) notFound();

  const listHref = "/student/homework";
  const listLabel = standalone ? "Пробники" : "Домашнее задание";

  const status = await homeworkStatus(hw, user.id);
  const due = new Date(hw.dueDate).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });

  const fullProblems = (await Promise.all(hw.problemIds.map((pid) => getProblem(pid)))).filter(
    (p): p is NonNullable<typeof p> => !!p
  );

  const items = await Promise.all(
    fullProblems.map(async (problem) => ({
      problem: toPublicProblem(problem),
      skillTitle: problem.skillId ? (await getSkill(problem.skillId))?.title ?? "" : "Своя задача",
    }))
  );
  const states = await computeProblemStates(user.id, fullProblems);

  // Таймер: только если у задания задан лимит и оно ещё не полностью решено —
  // сессия фиксирует момент старта, чтобы обновление страницы не сбрасывало отсчёт.
  let deadlineAt: string | null = null;
  if (hw.timeLimitMinutes && !status.complete) {
    const session = await getOrCreateAssignmentSession(hw.id, user.id);
    deadlineAt = new Date(
      new Date(session.startedAt).getTime() + hw.timeLimitMinutes * 60000
    ).toISOString();
  }

  return (
    <div className="min-h-screen pb-16">
      <AppHeader
        user={user}
        crumbs={[
          { label: listLabel, href: listHref },
          { label: hw.title },
        ]}
      />
      <main className="mx-auto max-w-2xl px-4">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-ink-soft">
              {KIND_LABEL[hw.kind] ?? "Задание"}
              {!hw.allowHints && " · без подсказок"}
            </p>
            <h1 className="font-display text-2xl font-black text-ink">{hw.title}</h1>
            <p className={`mt-1 text-sm font-semibold ${status.overdue ? "text-coral" : "text-ink-soft"}`}>
              {status.overdue ? "Просрочено, срок был " : "Сдать до "}
              {due}
            </p>
          </div>
        </div>

        <AssignmentFlow
          title={hw.title}
          kind={hw.kind}
          allowHints={hw.allowHints}
          items={items}
          initialStates={states}
          deadlineAt={deadlineAt}
        />
      </main>
    </div>
  );
}
