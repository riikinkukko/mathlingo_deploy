import {
  computeProblemStates,
  getHomeworkById,
  getOrCreateAssignmentSession,
  getProblem,
  getSkill,
  homeworkStatus,
} from "@/lib/queries";
import type { Problem } from "@/lib/types";
import { fail, json, mobileProblem, mobileState, requireStudent } from "@/lib/mobile/api";

export const dynamic = "force-dynamic";

/** Задание репетитора: задачи и их состояние, дедлайн таймера (если задан лимит). */
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const user = await requireStudent(req);
  if (user instanceof Response) return user;
  const { id } = await props.params;
  const hw = await getHomeworkById(id);
  if (!hw || hw.studentId !== user.id) return fail("Задание не найдено", 404);

  const problems = (await Promise.all(hw.problemIds.map((pid) => getProblem(pid)))).filter((p): p is Problem => !!p);
  const [status, states] = await Promise.all([homeworkStatus(hw, user.id), computeProblemStates(user.id, problems)]);
  let deadlineAt: string | null = null;
  if (hw.timeLimitMinutes && !status.complete) {
    const session = await getOrCreateAssignmentSession(hw.id, user.id);
    deadlineAt = new Date(new Date(session.startedAt).getTime() + hw.timeLimitMinutes * 60000).toISOString();
  }
  // Проверка без сети и подсказки — только у обычной домашки с подсказками:
  // в контрольной и пробнике ответ проверяет сервер, с учётом таймера.
  const offline = hw.kind === "homework" && hw.allowHints;
  const items = await Promise.all(
    problems.map(async (p) => ({
      problem: mobileProblem(p, { offline }),
      skillTitle: p.skillId ? (await getSkill(p.skillId))?.title ?? "" : "Своя задача",
      state: mobileState(states[p.id]),
    }))
  );
  return json({
    homework: { id: hw.id, title: hw.title, kind: hw.kind, allowHints: hw.allowHints, dueDate: hw.dueDate },
    status,
    deadlineAt,
    items,
  });
}
