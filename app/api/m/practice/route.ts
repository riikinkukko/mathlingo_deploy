import { getExamMapForStudent } from "@/lib/queries";
import { EXAM_TASK_COUNT, getNumberPractice } from "@/lib/practice";
import { fail, json, mobileProblem, requireStudent } from "@/lib/mobile/api";

export const dynamic = "force-dynamic";

/**
 * Тренировка по номерам ЕГЭ (lib/practice.ts).
 *  GET /api/m/practice       — карта: по каждому номеру сколько задач и сколько решено;
 *  GET /api/m/practice?n=7   — подборка задач №7 (сначала не решённые).
 */
export async function GET(req: Request) {
  const user = await requireStudent(req);
  if (user instanceof Response) return user;
  const raw = new URL(req.url).searchParams.get("n");
  if (raw === null) {
    const rows = await getExamMapForStudent(user.id);
    return json({ total: EXAM_TASK_COUNT, rows });
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > EXAM_TASK_COUNT) return fail("Нет такого номера", 400);
  const r = await getNumberPractice(user, n);
  return json({
    n,
    total: r.total,
    solved: r.solved,
    locked: r.locked,
    items: r.items.map((it) => ({ problem: mobileProblem(it.problem), skillTitle: it.skillTitle })),
  });
}
