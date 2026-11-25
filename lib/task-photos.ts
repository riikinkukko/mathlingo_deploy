import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
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

/** The owner can read their uploads; learners and parents need an assigned problem. */
export async function readTaskPhoto(user: User, id: string): Promise<{ mime: string; bytes: Buffer } | null> {
  const [row] = await db.select().from(schema.taskPhotos).where(eq(schema.taskPhotos.id, id)).limit(1);
  if (!row) return null;
  if (user.role !== "TEACHER" || row.teacherId !== user.id) {
    if (user.role !== "STUDENT" && user.role !== "PARENT") return null;
    const H = schema.homeworks;
    const P = schema.problems;
    const owner = user.role === "STUDENT"
      ? eq(H.studentId, user.id)
      : sql`exists (select 1 from ${schema.parentLinks}
          where ${schema.parentLinks.parentId} = ${user.id} and ${schema.parentLinks.studentId} = ${H.studentId})`;
    const [assigned] = await db.select({ id: H.id }).from(H)
      .innerJoin(P, and(eq(P.photoId, id), sql`${H.problemIds} ? ${P.id}`))
      .where(and(or(eq(H.audience, "assigned"), isNull(H.audience)), owner)).limit(1);
    if (!assigned) return null;
  }
  const match = /^data:(image\/[a-z]+);base64,(.+)$/.exec(row.data);
  return match ? { mime: match[1], bytes: Buffer.from(match[2], "base64") } : null;
}
