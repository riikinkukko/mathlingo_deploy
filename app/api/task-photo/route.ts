import { NextResponse } from "next/server";
import { getSessionUserOrNull } from "@/lib/auth";
import { getBearerUser } from "@/lib/api-auth";
import { saveTaskPhoto, TASK_PHOTO_MAX } from "@/lib/task-photos";

export const dynamic = "force-dynamic";

/** Загрузка снимка страницы сборника: { data: "data:image/jpeg;base64,…" } → { id }. */
export async function POST(req: Request) {
  const user = (await getSessionUserOrNull()) ?? (await getBearerUser(req));
  if (!user) return NextResponse.json({ error: "Войдите заново" }, { status: 401 });
  const raw = await req.text();
  if (raw.length > TASK_PHOTO_MAX + 200) return NextResponse.json({ error: "Слишком большое фото" }, { status: 413 });
  let data = "";
  try {
    data = String(JSON.parse(raw).data ?? "");
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }
  const r = await saveTaskPhoto(user, data);
  if ("error" in r) return NextResponse.json(r, { status: 400 });
  return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
}
