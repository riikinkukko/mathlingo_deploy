import { runAsUser } from "@/lib/auth";
import { fail, json, readJson, requireUser } from "@/lib/mobile/api";
import { parentChild, parentHome } from "@/lib/mobile/parent-data";
import { setParentWeeklyReportAction } from "@/app/actions-telegram";

export const dynamic = "force-dynamic";

/** GET ?view=home | child&id= — кабинет родителя в приложении. */
export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  if (user.role !== "PARENT") return fail("Только для родителя", 403);
  const q = new URL(req.url).searchParams;
  if (q.get("view") === "child") {
    const d = await parentChild(user, q.get("id") ?? "");
    return d ? json(d) : fail("Не найдено", 404);
  }
  return json(await parentHome(user));
}

/** POST { weeklyReport: boolean } — недельный отчёт по воскресеньям. */
export async function POST(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  if (user.role !== "PARENT") return fail("Только для родителя", 403);
  const body = await readJson<{ weeklyReport?: unknown }>(req);
  if (!body || typeof body.weeklyReport !== "boolean") return fail("Некорректный запрос");
  const fd = new FormData();
  if (body.weeklyReport) fd.append("weekly", "on");
  const r = await runAsUser(user, () => setParentWeeklyReportAction(null, fd));
  return r?.error ? fail(r.error, 400) : json({ ok: true });
}
