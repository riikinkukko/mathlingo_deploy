import { getMistakesForStudent } from "@/lib/queries";
import { json, mobileProblem, requireStudent } from "@/lib/mobile/api";

export const dynamic = "force-dynamic";

/** «Мои ошибки»: задачи, где ученик ошибался, — их можно перерешать прямо отсюда. */
export async function GET(req: Request) {
  const user = await requireStudent(req);
  if (user instanceof Response) return user;
  const mistakes = await getMistakesForStudent(user.id);
  return json({
    items: mistakes.map((m) => ({
      problem: mobileProblem(m.problem),
      skillId: m.problem.skillId ?? null,
      skillTitle: m.skillTitle,
      chapterTitle: m.chapterTitle,
      wrongAttempts: m.wrongAttempts,
      lastWrongAnswer: m.lastWrongAnswer,
      resolved: m.resolved,
    })),
  });
}
