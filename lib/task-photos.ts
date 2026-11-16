import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { genId } from "@/lib/queries";
import type { User } from "@/lib/types";

/** Предел снимка страницы: браузер/приложение сжимают до ~1600px JPEG. */
export const TASK_PHOTO_MAX = 1_200_000;
const DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

/** Сохранить снимок страницы сборника репетитора. */
export async function saveTaskPhoto(teacher: User, data: string): Promise<{ id: string } | { error: string }> {
  if (teacher.role !== "TEACHER") return { error: "Только для репетитора" };
  if (typeof data !== "string" || !DATA_URL.test(data)) return { error: "Нужна картинка (JPEG или PNG)" };
  if (data.length > TASK_PHOTO_MAX) return { error: "Слишком большое фото" };
  const id = genId("tp");
  await db.insert(schema.taskPhotos).values({ id, teacherId: teacher.id, data });
  return { id };
}

/** Из присланных id оставить только снимки этого репетитора. */
export async function ownTaskPhotoIds(teacherId: string, ids: string[]): Promise<Set<string>> {
  const uniq = Array.from(new Set(ids.filter((x) => typeof x === "string" && x))).slice(0, 30);
  if (!uniq.length) return new Set();
  const rows = await db
    .select({ id: schema.taskPhotos.id })
    .from(schema.taskPhotos)
    .where(and(eq(schema.taskPhotos.teacherId, teacherId), inArray(schema.taskPhotos.id, uniq)));
  return new Set(rows.map((r) => r.id));
}

/**
 * Снимок видят: сам репетитор, его ученики и их родители. Ученик, ушедший к
 * другому репетитору, старые снимки уже не откроет — это нормально.
 */
export async function readTaskPhoto(user: User, id: string): Promise<{ mime: string; bytes: Buffer } | null> {
  const [row] = await db.select().from(schema.taskPhotos).where(eq(schema.taskPhotos.id, id)).limit(1);
  if (!row) return null;
  let allowed = row.teacherId === user.id || user.teacherId === row.teacherId;
  if (!allowed && user.role === "PARENT") {
    const kids = await db
      .select({ teacherId: schema.users.teacherId })
      .from(schema.parentLinks)
      .innerJoin(schema.users, eq(schema.users.id, schema.parentLinks.studentId))
      .where(eq(schema.parentLinks.parentId, user.id));
    allowed = kids.some((k) => k.teacherId === row.teacherId);
  }
  if (!allowed) return null;
  const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(row.data);
  return m ? { mime: m[1], bytes: Buffer.from(m[2], "base64") } : null;
}
