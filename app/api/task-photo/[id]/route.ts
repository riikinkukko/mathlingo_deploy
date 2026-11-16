import { NextResponse } from "next/server";
import { getSessionUserOrNull } from "@/lib/auth";
import { getBearerUser } from "@/lib/api-auth";
import { readTaskPhoto } from "@/lib/task-photos";

export const dynamic = "force-dynamic";

/** Снимок страницы сборника к задаче репетитора (сайт — cookie, приложение — Bearer). */
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const user = (await getSessionUserOrNull()) ?? (await getBearerUser(req));
  if (!user) return new NextResponse("Требуется вход", { status: 401 });
  const photo = await readTaskPhoto(user, id);
  if (!photo) return new NextResponse("Не найдено", { status: 404 });
  return new NextResponse(new Uint8Array(photo.bytes), {
    headers: { "Content-Type": photo.mime, "Cache-Control": "private, max-age=604800, immutable" },
  });
}
