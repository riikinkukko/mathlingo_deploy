import { getLessonData } from "@/lib/lesson-data";
import { fail, json, mobileProblem, mobileState, mobileTheory, requireStudent } from "@/lib/mobile/api";

export const dynamic = "force-dynamic";

/** Урок: теория, задачи (с отпечатками ответов для работы без сети) и их состояние. */
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const user = await requireStudent(req);
  if (user instanceof Response) return user;
  const { id } = await props.params;
  const data = await getLessonData(user, id);
  if (data.status === "notfound") return fail("Урок не найден", 404);
  if (data.status === "upgrade") return json({ status: "upgrade" });
  if (data.status === "locked") return json({ status: "locked", topicId: data.topicId });
  return json({
    status: "ok",
    skill: { id: data.skill.id, title: data.skill.title, theory: mobileTheory(data.skill.theoryCards) },
    topicId: data.topicId,
    problems: data.problems.map((p) => mobileProblem(p)),
    states: Object.fromEntries(data.problems.map((p) => [p.id, mobileState(data.states[p.id])])),
    next: data.next ? { id: data.next.id, title: data.next.title } : null,
    forceTheoryFirst: data.forceTheoryFirst,
    detailedPreview: data.detailedPreview,
    canAskTeacher: !!user.teacherId,
  });
}
