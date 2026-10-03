"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq, and, gte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import {
  genId,
  getUserById,
  getScheduledLessonById,
  pushNotification,
} from "@/lib/queries";
import { applyLessonStatus } from "@/lib/lesson-status";
import { getGroupForTeacher } from "@/lib/groups";

// Все ученики платформы — российские (ЕГЭ), поэтому наивное время из
// <input type="datetime-local"> трактуем как московское, а не как локальное
// время сервера (Timeweb обычно в UTC — иначе занятия «уезжали» бы на 3 часа).
const MSK_OFFSET = "+03:00";

function parseMskDateTime(value: string): Date | null {
  // datetime-local отдаёт "YYYY-MM-DDTHH:MM" (без секунд).
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const d = new Date(`${value}:00${MSK_OFFSET}`);
  return isNaN(d.getTime()) ? null : d;
}

function formatMsk(d: Date): string {
  return d.toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const WEEK_MS = 7 * 24 * 3600 * 1000;
/** Допустимые варианты «повторять каждую неделю»: 1 = без повтора. */
const REPEAT_OPTIONS = [1, 4, 8, 12, 24];
const WEEKDAY_DATIVE = [
  "по понедельникам",
  "по вторникам",
  "по средам",
  "по четвергам",
  "по пятницам",
  "по субботам",
  "по воскресеньям",
];

/** День недели по Москве: 0 — понедельник … 6 — воскресенье. */
function weekdayMsk(d: Date): number {
  const short = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Moscow", weekday: "short" }).format(d);
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(short);
}

function timeMsk(d: Date): string {
  return d.toLocaleTimeString("ru-RU", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit" });
}

async function assertOwnsStudent(teacherId: string, studentId: string): Promise<boolean> {
  const s = await getUserById(studentId);
  return !!s && s.role === "STUDENT" && s.teacherId === teacherId;
}

/** Куда вернуться после действия: на страницу ученика, группы или в общее расписание. */
function backTo(from: string, studentId: string, groupId?: string | null): string {
  if (from === "student") return `/teacher/student/${studentId}`;
  if (from === "group" && groupId) return `/teacher/groups/${groupId}`;
  if (from === "home") return "/teacher";
  return "/teacher/schedule";
}

export type CreateLessonState = { ok?: boolean; error?: string; at?: number; count?: number } | null;

/**
 * Планирование занятия. Работает через useFormState (без редиректа): так форма
 * на клиенте узнаёт об успехе и очищает поля, а ошибку показывает на месте.
 * Данные страниц обновляются через revalidatePath.
 */
export async function createLessonAction(
  _prev: CreateLessonState,
  formData: FormData
): Promise<CreateLessonState> {
  const teacher = await getSessionUser();
  // «studentId» из формы — id ученика или «g:<id группы>».
  const target = String(formData.get("studentId") || "");

  if (!teacher || teacher.role !== "TEACHER") return { error: "Доступ запрещён" };
  if (!target) return { error: "Выберите ученика или группу" };

  let studentIds: string[];
  let group: Awaited<ReturnType<typeof getGroupForTeacher>> = undefined;
  if (target.startsWith("g:")) {
    group = await getGroupForTeacher(target.slice(2), teacher.id);
    if (!group) return { error: "Группа не найдена" };
    if (group.members.length === 0) return { error: "В группе нет учеников" };
    studentIds = group.members.map((m) => m.id);
  } else {
    if (!(await assertOwnsStudent(teacher.id, target))) return { error: "Ученик не найден" };
    studentIds = [target];
  }

  const startsAt = parseMskDateTime(String(formData.get("startsAt") || ""));
  const durationMin = Math.max(15, Math.min(300, Number(formData.get("durationMin")) || 60));
  const topic = String(formData.get("topic") || "").trim() || null;

  if (!startsAt) return { error: "Укажите дату и время занятия" };

  // Повтор: 1 — разовое занятие, иначе столько недель подряд (только из списка).
  const repeatWeeks = Number(formData.get("repeatWeeks") || 1);
  if (!REPEAT_OPTIONS.includes(repeatWeeks)) return { error: "Некорректный вариант повтора" };

  // Каждое занятие серии — через ровно 7 суток. В Москве нет перехода на
  // летнее время, поэтому время занятия не «уезжает».
  const dates = Array.from({ length: repeatWeeks }, (_, i) => new Date(startsAt.getTime() + i * WEEK_MS));
  const seriesId = repeatWeeks > 1 ? genId("ser") : null;

  // У группового занятия — строка на каждого ученика; строки одного занятия
  // связаны общим groupLessonId (посещаемость отмечается по ученикам).
  const groupLessonIds = dates.map(() => (group ? genId("gl") : null));

  await db.transaction(async (tx) => {
    await tx.insert(schema.scheduledLessons).values(
      dates.flatMap((d, i) =>
        studentIds.map((studentId) => ({
          id: genId("sl"),
          teacherId: teacher.id,
          studentId,
          startsAt: d,
          durationMin,
          topic,
          status: "planned" as const,
          seriesId,
          groupId: group?.id ?? null,
          groupLessonId: groupLessonIds[i],
        }))
      )
    );

    // Одно уведомление на всю серию — а не 12 сообщений подряд в Telegram.
    for (const studentId of studentIds)
    await pushNotification(tx, {
      userId: studentId,
      type: "lesson_scheduled",
      title:
        repeatWeeks > 1
          ? `Регулярные занятия ${WEEKDAY_DATIVE[weekdayMsk(startsAt)]} в ${timeMsk(startsAt)}`
          : `Занятие назначено: ${formatMsk(startsAt)}`,
      body:
        repeatWeeks > 1
          ? `Первое — ${formatMsk(startsAt)}, всего ${repeatWeeks} занятий.${topic ? ` Тема: ${topic}` : ""}`
          : topic
            ? `Тема: ${topic}`
            : "Не пропусти — увидимся на занятии!",
      link: `/student`,
    });
  });

  revalidatePath("/teacher/schedule");
  revalidatePath("/teacher");
  for (const studentId of studentIds) revalidatePath(`/teacher/student/${studentId}`);
  if (group) revalidatePath(`/teacher/groups/${group.id}`);
  // at — метка времени, чтобы два успешных сохранения подряд были разными
  // состояниями и эффект очистки формы срабатывал каждый раз.
  return { ok: true, at: Date.now(), count: repeatWeeks };
}

export async function setLessonStatusAction(formData: FormData) {
  const teacher = await getSessionUser();
  const lessonId = String(formData.get("lessonId") || "");
  const status = String(formData.get("status") || "");
  const from = String(formData.get("from") || "schedule");

  const lesson = await getScheduledLessonById(lessonId);
  const back = backTo(from, lesson?.studentId || "", lesson?.groupId);

  if (!teacher || teacher.role !== "TEACHER") redirect(`${back}?error=1`);
  if (!lesson || lesson.teacherId !== teacher.id) redirect(`${back}?error=1`);
  if (status !== "done" && status !== "cancelled") redirect(`${back}?error=1`);

  // Та же логика, что у кнопок «Было / Не было» в Telegram.
  await applyLessonStatus(teacher.id, lessonId, status);

  revalidatePath("/teacher/schedule");
  revalidatePath("/teacher");
  revalidatePath(`/teacher/student/${lesson.studentId}`);
  // После «Провести/Было» страница покажет плашку «Записать отчёт →».
  redirect(status === "done" ? `${back}?done=${encodeURIComponent(lessonId)}` : `${back}?ok=lesson`);
}

export async function deleteLessonAction(formData: FormData) {
  const teacher = await getSessionUser();
  const lessonId = String(formData.get("lessonId") || "");
  const from = String(formData.get("from") || "schedule");

  const lesson = await getScheduledLessonById(lessonId);
  const back = backTo(from, lesson?.studentId || "", lesson?.groupId);

  if (!teacher || teacher.role !== "TEACHER") redirect(`${back}?error=1`);
  if (!lesson || lesson.teacherId !== teacher.id) redirect(`${back}?error=1`);

  // wholeGroup — удалить занятие у всей группы (из общего расписания);
  // со страницы ученика удаляется только его строка.
  const wholeGroup = formData.get("wholeGroup") === "1" && !!lesson.groupLessonId;
  await db
    .delete(schema.scheduledLessons)
    .where(
      wholeGroup
        ? and(
            eq(schema.scheduledLessons.groupLessonId, lesson.groupLessonId!),
            eq(schema.scheduledLessons.teacherId, teacher.id)
          )
        : eq(schema.scheduledLessons.id, lessonId)
    );

  revalidatePath("/teacher/schedule");
  revalidatePath("/teacher");
  revalidatePath(`/teacher/student/${lesson.studentId}`);
  if (lesson.groupId) revalidatePath(`/teacher/groups/${lesson.groupId}`);
  redirect(`${backTo(from, lesson.studentId, lesson.groupId)}?ok=lesson`);
}

/**
 * «Удалить это и все следующие» для еженедельной серии. Удаляем только
 * ЗАПЛАНИРОВАННЫЕ занятия серии, начиная с выбранного: проведённые и
 * отменённые остаются — от проведённых зависит баланс оплат.
 */
export async function deleteLessonSeriesFromAction(formData: FormData) {
  const teacher = await getSessionUser();
  const lessonId = String(formData.get("lessonId") || "");
  const from = String(formData.get("from") || "schedule");

  const lesson = await getScheduledLessonById(lessonId);
  const back = backTo(from, lesson?.studentId || "", lesson?.groupId);

  if (!teacher || teacher.role !== "TEACHER") redirect(`${back}?error=1`);
  if (!lesson || lesson.teacherId !== teacher.id || !lesson.seriesId) redirect(`${back}?error=1`);

  // У групповой серии общий seriesId на всех учеников: со страницы ученика
  // удаляем серию только у него, из расписания/группы — у всей группы.
  const wholeGroup = formData.get("wholeGroup") === "1";
  await db
    .delete(schema.scheduledLessons)
    .where(
      and(
        eq(schema.scheduledLessons.seriesId, lesson.seriesId),
        eq(schema.scheduledLessons.teacherId, teacher.id),
        eq(schema.scheduledLessons.status, "planned"),
        gte(schema.scheduledLessons.startsAt, new Date(lesson.startsAt)),
        ...(wholeGroup ? [] : [eq(schema.scheduledLessons.studentId, lesson.studentId)])
      )
    );

  revalidatePath("/teacher/schedule");
  revalidatePath("/teacher");
  revalidatePath(`/teacher/student/${lesson.studentId}`);
  if (lesson.groupId) revalidatePath(`/teacher/groups/${lesson.groupId}`);
  redirect(`${backTo(from, lesson.studentId, lesson.groupId)}?ok=lesson`);
}

/**
 * Отметка группового занятия: кто был (present) — «было», остальные — «не было»
 * (занятие им не засчитывается в баланс). mode=cancel — занятия не было ни у кого.
 */
export async function setGroupLessonStatusAction(formData: FormData) {
  const teacher = await getSessionUser();
  const groupLessonId = String(formData.get("groupLessonId") || "");
  const mode = String(formData.get("mode") || "");
  const from = String(formData.get("from") || "schedule");
  const present = new Set(formData.getAll("present").map(String));

  const rows = groupLessonId
    ? await db
        .select({ id: schema.scheduledLessons.id, studentId: schema.scheduledLessons.studentId, groupId: schema.scheduledLessons.groupId, teacherId: schema.scheduledLessons.teacherId })
        .from(schema.scheduledLessons)
        .where(eq(schema.scheduledLessons.groupLessonId, groupLessonId))
    : [];
  const back = backTo(from, "", rows[0]?.groupId);

  if (!teacher || teacher.role !== "TEACHER") redirect(`${back}?error=1`);
  if (rows.length === 0 || rows.some((r) => r.teacherId !== teacher.id)) redirect(`${back}?error=1`);
  if (mode !== "attendance" && mode !== "cancel") redirect(`${back}?error=1`);

  for (const r of rows) {
    const status = mode === "attendance" && present.has(r.studentId) ? "done" : "cancelled";
    await applyLessonStatus(teacher.id, r.id, status);
    revalidatePath(`/teacher/student/${r.studentId}`);
  }

  revalidatePath("/teacher/schedule");
  revalidatePath("/teacher");
  if (rows[0].groupId) revalidatePath(`/teacher/groups/${rows[0].groupId}`);
  redirect(`${back}?ok=lesson`);
}
