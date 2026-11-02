import { getHomeworksForStudent, homeworkStatus } from "@/lib/queries";
import { json, requireStudent } from "@/lib/mobile/api";

export const dynamic = "force-dynamic";

/** Домашние задания, контрольные и пробники от репетитора. */
export async function GET(req: Request) {
  const user = await requireStudent(req);
  if (user instanceof Response) return user;
  const hws = (await getHomeworksForStudent(user.id)).filter((h) => h.studentId === user.id);
  const items = await Promise.all(
    hws.map(async (h) => {
      const st = await homeworkStatus(h, user.id);
      return { id: h.id, title: h.title, kind: h.kind, dueDate: h.dueDate, timeLimitMinutes: h.timeLimitMinutes ?? null, ...st };
    })
  );
  return json({ items });
}
