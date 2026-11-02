import { getDueReviewProblems } from "@/lib/queries";
import { json, mobileProblem, requireStudent } from "@/lib/mobile/api";

export const dynamic = "force-dynamic";

/** Задачи интервального повторения, которые пора решить сегодня. */
export async function GET(req: Request) {
  const user = await requireStudent(req);
  if (user instanceof Response) return user;
  const due = await getDueReviewProblems(user.id);
  return json({
    items: due.map((d) => ({ problem: mobileProblem(d.problem), skillTitle: d.skillTitle, box: d.box })),
  });
}
