import { getSessionUser } from "@/lib/auth";
import { buildTeacherExport } from "@/lib/teacher-export";

export const dynamic = "force-dynamic";

/** Выгрузка всех данных кабинета репетитора в Excel одной кнопкой. */
export async function GET() {
  const teacher = await getSessionUser();
  if (!teacher || teacher.role !== "TEACHER") return new Response("Доступ запрещён", { status: 403 });
  const buf = await buildTeacherExport(teacher);
  const day = new Date().toISOString().slice(0, 10);
  const file = `planimetrika-${day}.xlsx`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${file}"; filename*=UTF-8''${encodeURIComponent("Планиметрика-" + day + ".xlsx")}`,
      "Cache-Control": "no-store",
    },
  });
}
