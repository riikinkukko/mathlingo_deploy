// Отчёт после урока: черновик с фактами, сохранение (с уведомлениями ученику
// и родителям), список проведённых занятий без отчёта, вечернее напоминание
// и ответ отчётом прямо в Telegram.
// Относительные импорты: часть кода работает в воркере бота (tsx, вне Next.js).
import { and, desc, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "./db/client";
import * as schema from "./db/schema";
import { genId, getScheduledLessonById, getUpcomingLessonsForStudent, getUserById, pushNotification } from "./queries";
import { pluralRu } from "./pluralize";
import { sendTelegramMessage, escapeTelegramHtml as esc, type InlineKeyboard } from "./telegram";

const TZ = "Europe/Moscow";
const DAY = 86_400_000;
/** Сколько бот ждёт текст отчёта после кнопки «Написать отчёт». */
export const TG_REPORT_WAIT_MS = 6 * 3600 * 1000;
/** Вечернее напоминание о занятиях без отчёта — с 20:30 до 23:00 МСК. */
const REMIND_FROM_MIN = 20 * 60 + 30;
const REMIND_TO_MIN = 23 * 60;

/** Строки шаблона, которые репетитор заполняет сам. Пустые при сохранении убираются. */
export const REPORT_TEMPLATE_LABELS = ["Что делали", "Получилось", "Поработать над"] as const;

export function mskDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}
function mskMinutes(d: Date): number {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  return Number(p.find((x) => x.type === "hour")!.value) * 60 + Number(p.find((x) => x.type === "minute")!.value);
}
const mskTime = (d: Date) => d.toLocaleTimeString("ru-RU", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const mskDate = (d: Date) => d.toLocaleDateString("ru-RU", { timeZone: TZ, day: "numeric", month: "long" });
const mskWhen = (d: Date) => d.toLocaleDateString("ru-RU", { timeZone: TZ, weekday: "short", day: "numeric", month: "long" }) + `, ${mskTime(d)}`;

/** Убрать незаполненные строки шаблона («Получилось: » без текста). */
export function cleanReport(text: string): string {
  const empty = new RegExp(`^\\s*(${REPORT_TEMPLATE_LABELS.join("|")})\\s*:\\s*$`, "i");
  return text
    .split("\n")
    .filter((l) => !empty.test(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface ReportDraft {
  date: string;
  topic: string;
  /** Факты, собранные автоматически: домашка, практика между занятиями, следующее занятие. */
  facts: string[];
  /** Готовый текст для формы: строки шаблона + факты. */
  report: string;
}

/**
 * Черновик отчёта о занятии. lessonId — занятие из расписания (своё и этого
 * ученика), иначе — отчёт «на сегодня».
 */
export async function buildReportDraft(teacherId: string, studentId: string, lessonId?: string | null): Promise<ReportDraft> {
  const lesson = lessonId ? await getScheduledLessonById(lessonId) : undefined;
  const own = lesson && lesson.teacherId === teacherId && lesson.studentId === studentId ? lesson : undefined;
  const at = own ? new Date(own.startsAt) : new Date();

  // Практика между занятиями: с прошлого проведённого занятия (не дольше 14 дней).
  const prev = await db
    .select({ startsAt: schema.scheduledLessons.startsAt })
    .from(schema.scheduledLessons)
    .where(
      and(
        eq(schema.scheduledLessons.studentId, studentId),
        eq(schema.scheduledLessons.teacherId, teacherId),
        eq(schema.scheduledLessons.status, "done"),
        sql`${schema.scheduledLessons.startsAt} < ${at}`
      )
    )
    .orderBy(desc(schema.scheduledLessons.startsAt))
    .limit(1);
  const since = new Date(Math.max(prev[0]?.startsAt.getTime() ?? 0, at.getTime() - 14 * DAY));
  const [practice] = await db
    .select({
      total: sql<number>`count(*)::int`,
      correct: sql<number>`count(*) filter (where ${schema.attempts.isCorrect})::int`,
      solved: sql<number>`count(distinct ${schema.attempts.problemId}) filter (where ${schema.attempts.isCorrect})::int`,
    })
    .from(schema.attempts)
    .where(and(eq(schema.attempts.studentId, studentId), gte(schema.attempts.createdAt, since), lte(schema.attempts.createdAt, at)));

  // Домашка, выданная в день занятия (до конца следующего дня — бывает, задают вечером).
  const hw = await db
    .select({ title: schema.homeworks.title, dueDate: schema.homeworks.dueDate, n: sql<number>`jsonb_array_length(${schema.homeworks.problemIds})::int` })
    .from(schema.homeworks)
    .where(
      and(
        eq(schema.homeworks.studentId, studentId),
        eq(schema.homeworks.teacherId, teacherId),
        gte(schema.homeworks.createdAt, new Date(at.getTime() - 3 * 3600 * 1000)),
        lte(schema.homeworks.createdAt, new Date(at.getTime() + 2 * DAY))
      )
    )
    .orderBy(desc(schema.homeworks.createdAt))
    .limit(3);

  const next = (await getUpcomingLessonsForStudent(studentId, teacherId)).find((l) => new Date(l.startsAt).getTime() > at.getTime() + 60_000);

  const facts: string[] = [];
  for (const h of hw) facts.push(`Домашка: ${h.title} (${h.n} ${pluralRu(h.n, ["задача", "задачи", "задач"])}), срок — ${mskDate(h.dueDate)}.`);
  if (practice && practice.total > 0) {
    const acc = Math.round((practice.correct / practice.total) * 100);
    facts.push(`Между занятиями в приложении: ${practice.solved} ${pluralRu(practice.solved, ["задача решена", "задачи решено", "задач решено"])}, точность ${acc}%.`);
  }
  if (next) facts.push(`Следующее занятие: ${mskWhen(new Date(next.startsAt))}.`);

  const topic = own?.topic ?? "";
  const report = [...REPORT_TEMPLATE_LABELS.map((l, i) => `${l}: ${i === 0 && topic ? topic : ""}`), ...(facts.length ? ["", ...facts] : [])].join("\n");
  return { date: mskDay(at), topic, facts, report };
}

export type CreateReportResult = { ok: true; id: string } | { ok: false; reason: "access" | "empty" | "exists" };

/** Сохранить отчёт и уведомить ученика и родителей. */
export async function createLessonReport(p: {
  teacherId: string;
  studentId: string;
  date: string;
  topic: string;
  report: string;
  lessonId?: string | null;
}): Promise<CreateReportResult> {
  const student = await getUserById(p.studentId);
  if (!student || student.role !== "STUDENT" || student.teacherId !== p.teacherId) return { ok: false, reason: "access" };
  const date = p.date.slice(0, 10);
  const topic = p.topic.trim().slice(0, 200);
  const report = cleanReport(p.report).slice(0, 5000);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !topic || !report) return { ok: false, reason: "empty" };

  let lessonId: string | null = null;
  if (p.lessonId) {
    const l = await getScheduledLessonById(p.lessonId);
    if (l && l.teacherId === p.teacherId && l.studentId === p.studentId) {
      const dup = await db.select({ id: schema.lessonLogs.id }).from(schema.lessonLogs).where(eq(schema.lessonLogs.lessonId, l.id)).limit(1);
      if (dup[0]) return { ok: false, reason: "exists" };
      lessonId = l.id;
    }
  }

  const parents = await db.select().from(schema.parentLinks).where(eq(schema.parentLinks.studentId, p.studentId));
  const id = genId("l");
  await db.transaction(async (tx) => {
    await tx.insert(schema.lessonLogs).values({ id, teacherId: p.teacherId, studentId: p.studentId, date, topic, report, lessonId });
    const body = report.length > 120 ? report.slice(0, 120) + "…" : report;
    await pushNotification(tx, { userId: p.studentId, type: "lesson_log_added", title: `Новая запись о занятии: ${topic}`, body, link: `/student` });
    for (const link of parents) {
      await pushNotification(tx, {
        userId: link.parentId,
        type: "lesson_log_added",
        title: `Новая запись о занятии: ${topic}`,
        body,
        link: `/parent/child/${p.studentId}`,
      });
    }
  });
  return { ok: true, id };
}

export interface UnreportedLesson {
  id: string;
  studentId: string;
  studentName: string;
  startsAt: string;
  topic: string | null;
}

/**
 * Проведённые индивидуальные занятия за последние days дней без отчёта.
 * Занятие считается с отчётом, если к нему привязан отчёт или есть запись
 * журнала этому ученику в тот же день (старые записи без привязки).
 */
export async function getUnreportedLessons(teacherId: string, { days = 14, studentId }: { days?: number; studentId?: string } = {}): Promise<UnreportedLesson[]> {
  const from = new Date(Date.now() - days * DAY);
  const rows = await db
    .select({ l: schema.scheduledLessons, name: schema.users.name })
    .from(schema.scheduledLessons)
    .innerJoin(schema.users, eq(schema.users.id, schema.scheduledLessons.studentId))
    .where(
      and(
        eq(schema.scheduledLessons.teacherId, teacherId),
        eq(schema.scheduledLessons.status, "done"),
        isNull(schema.scheduledLessons.groupLessonId),
        gte(schema.scheduledLessons.startsAt, from),
        lte(schema.scheduledLessons.startsAt, new Date()),
        studentId ? eq(schema.scheduledLessons.studentId, studentId) : undefined
      )
    )
    .orderBy(desc(schema.scheduledLessons.startsAt));
  if (!rows.length) return [];
  const logs = await db
    .select({ lessonId: schema.lessonLogs.lessonId, studentId: schema.lessonLogs.studentId, date: schema.lessonLogs.date })
    .from(schema.lessonLogs)
    .where(
      and(
        eq(schema.lessonLogs.teacherId, teacherId),
        inArray(schema.lessonLogs.studentId, [...new Set(rows.map((r) => r.l.studentId))]),
        or(isNotNull(schema.lessonLogs.lessonId), gte(schema.lessonLogs.date, mskDay(from)))
      )
    );
  const byLesson = new Set(logs.map((l) => l.lessonId).filter(Boolean));
  const byDay = new Set(logs.map((l) => `${l.studentId}|${l.date}`));
  return rows
    .filter((r) => !byLesson.has(r.l.id) && !byDay.has(`${r.l.studentId}|${mskDay(r.l.startsAt)}`))
    .map((r) => ({ id: r.l.id, studentId: r.l.studentId, studentName: r.name, startsAt: r.l.startsAt.toISOString(), topic: r.l.topic }));
}

// ------------------------------------------------------------- Telegram

export function reportButton(lessonId: string, label = "✍️ Написать отчёт здесь"): { text: string; callback_data: string } {
  return { text: label, callback_data: `rp:${lessonId}` };
}

/** Кнопка «Написать отчёт»: бот ждёт следующее сообщение как текст отчёта. */
export async function startTelegramReport(teacherId: string, chatId: string, lessonId: string): Promise<string> {
  const lesson = await getScheduledLessonById(lessonId);
  if (!lesson || lesson.teacherId !== teacherId) return "Занятие не найдено";
  const dup = await db.select({ id: schema.lessonLogs.id }).from(schema.lessonLogs).where(eq(schema.lessonLogs.lessonId, lessonId)).limit(1);
  if (dup[0]) return "Отчёт об этом занятии уже есть";
  await db.update(schema.users).set({ tgReportLessonId: lessonId, tgReportAskedAt: new Date() }).where(eq(schema.users.id, teacherId));
  const student = await getUserById(lesson.studentId);
  const draft = await buildReportDraft(teacherId, lesson.studentId, lessonId);
  const startsAt = new Date(lesson.startsAt);
  const text =
    `<b>Отчёт: ${esc(student?.name ?? "ученик")}, ${esc(mskDate(startsAt))}, ${mskTime(startsAt)}</b>\n\n` +
    `Напишите одним сообщением, что делали, что получилось и над чем поработать. ` +
    (lesson.topic ? `Тема — «${esc(lesson.topic)}».` : `Первая строка станет темой занятия.`) +
    (draft.facts.length ? `\n\nДобавлю сам:\n${draft.facts.map((f) => `• ${esc(f)}`).join("\n")}` : "") +
    `\n\nОтчёт получат ученик и родители. /cancel — отменить.`;
  await sendTelegramMessage(chatId, text);
  return "Жду текст отчёта";
}

/**
 * Обычное сообщение репетитора в боте. true — сообщение было отчётом (или
 * /cancel) и обработано; false — бот ничего не ждал.
 */
export async function handleTelegramReportText(chatId: string, text: string, now: Date = new Date()): Promise<boolean> {
  const rows = await db
    .select({ id: schema.users.id, lessonId: schema.users.tgReportLessonId, askedAt: schema.users.tgReportAskedAt })
    .from(schema.users)
    .where(and(eq(schema.users.telegramChatId, chatId), eq(schema.users.role, "TEACHER"), isNotNull(schema.users.tgReportLessonId)))
    .limit(1);
  const t = rows[0];
  if (!t?.lessonId) return false;
  const clear = () => db.update(schema.users).set({ tgReportLessonId: null, tgReportAskedAt: null }).where(eq(schema.users.id, t.id));
  if (!t.askedAt || now.getTime() - t.askedAt.getTime() > TG_REPORT_WAIT_MS) {
    await clear();
    return false;
  }
  if (/^\/cancel(@\w+)?$/.test(text.trim())) {
    await clear();
    await sendTelegramMessage(chatId, "Хорошо, отчёт не отправляю.");
    return true;
  }
  if (text.startsWith("/")) return false;

  const lesson = await getScheduledLessonById(t.lessonId);
  await clear();
  if (!lesson) {
    await sendTelegramMessage(chatId, "Занятие не найдено — возможно, его удалили.");
    return true;
  }
  const body = text.trim();
  const firstLine = body.split("\n")[0].trim();
  const topic = lesson.topic?.trim() || (firstLine.length > 80 ? firstLine.slice(0, 77) + "…" : firstLine);
  const draft = await buildReportDraft(t.id, lesson.studentId, lesson.id);
  const report = draft.facts.length ? `${body}\n\n${draft.facts.join("\n")}` : body;
  const res = await createLessonReport({ teacherId: t.id, studentId: lesson.studentId, date: mskDay(new Date(lesson.startsAt)), topic, report, lessonId: lesson.id });
  await sendTelegramMessage(
    chatId,
    res.ok ? "✅ Отчёт отправлен ученику и родителям." : res.reason === "exists" ? "Отчёт об этом занятии уже есть." : "Не получилось сохранить отчёт — напишите его в кабинете."
  );
  return true;
}

/** Вечером (20:30–23:00 МСК) — одно сообщение о сегодняшних занятиях без отчёта. */
export async function sendReportReminders(now: Date = new Date()): Promise<number> {
  const minutes = mskMinutes(now);
  if (minutes < REMIND_FROM_MIN || minutes >= REMIND_TO_MIN) return 0;
  const day = mskDay(now);
  const claimed = await db
    .update(schema.users)
    .set({ reportRemindedOn: day })
    .where(
      and(
        eq(schema.users.role, "TEACHER"),
        isNotNull(schema.users.telegramChatId),
        eq(schema.users.tgNotifyLessons, true),
        or(isNull(schema.users.reportRemindedOn), sql`${schema.users.reportRemindedOn} <> ${day}`)
      )
    )
    .returning({ id: schema.users.id, chatId: schema.users.telegramChatId });
  let sent = 0;
  for (const t of claimed) {
    try {
      const today = (await getUnreportedLessons(t.id, { days: 1 })).filter((l) => mskDay(new Date(l.startsAt)) === day);
      if (!today.length || !t.chatId) continue;
      const lines = today.map((l) => `• ${esc(l.studentName)}, ${mskTime(new Date(l.startsAt))}${l.topic ? ` · ${esc(l.topic)}` : ""}`);
      const kb: InlineKeyboard = { inline_keyboard: today.slice(0, 8).map((l) => [reportButton(l.id, `✍️ ${l.studentName.split(" ")[0]}, ${mskTime(new Date(l.startsAt))}`)]) };
      const text =
        `<b>Сегодня без отчёта: ${today.length}</b>\n${lines.join("\n")}\n\n` +
        `Пара строк о занятии — и ученик с родителями увидят, что прошли и над чем работать. Нажмите на имя и напишите отчёт прямо сюда.`;
      if (await sendTelegramMessage(t.chatId, text, { replyMarkup: kb })) sent++;
    } catch (e) {
      console.error("[lesson-report] не удалось напомнить об отчётах", t.id, e);
    }
  }
  return sent;
}
