import { eq } from "drizzle-orm";
import { withDeliveryLocks } from "@/lib/student-links";
import * as schema from "@/lib/db/schema";
import { getUserById } from "@/lib/queries";
import { fail, json, readJson, requireStudent } from "@/lib/mobile/api";
import { userSummary } from "@/lib/mobile/session";

export const dynamic = "force-dynamic";

/** Настройки ученика из приложения: { reminders: boolean } — вечерние напоминания о серии и сроках. */
export async function POST(req: Request) {
  const user = await requireStudent(req);
  if (user instanceof Response) return user;
  const body = await readJson<{ reminders?: unknown }>(req, 1_000);
  if (typeof body?.reminders !== "boolean") return fail("Неверный запрос");
  const reminders = body.reminders;
  await withDeliveryLocks([user.id], false, (connection) => connection.update(schema.users)
    .set({ tgStudentReminders: reminders }).where(eq(schema.users.id, user.id)));
  return json({ user: userSummary((await getUserById(user.id))!) });
}
