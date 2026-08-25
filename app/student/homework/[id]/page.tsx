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
  isEffectivelyPro,
  getHomeworkById,
} from "@/lib/queries";
import AssignmentFlow from "@/components/AssignmentFlow";

export default async function HomeworkPage({ params }: { params: { id: string } }) {
  const user = (await getSessionUser())!;
  const hw = await getHomeworkById(params.id);

  const standalone = isStandaloneStudent(user);
  const isOwnAssignment = hw && hw.studentId === user.id;
  const isAccessiblePublicExam =
    hw && hw.audience === "pro_standalone" && standalone && isEffectivelyPro(user);
  if (!hw || (!isOwnAssignment && !isAccessiblePublicExam)) notFound();

  const status = await homeworkStatus(hw, user.id);

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
    <div className="min-h-screen bg-paper px-4 pb-16 pt-[max(1rem,var(--safe-area-inset-top,env(safe-area-inset-top)))]">
      <AssignmentFlow
        title={hw.title}
        kind={hw.kind}
        allowHints={hw.allowHints}
        items={items}
        initialStates={states}
        deadlineAt={deadlineAt}
      />
    </div>
  );
}
