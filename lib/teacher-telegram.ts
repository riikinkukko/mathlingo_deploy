// Telegram для РЕПЕТИТОРА: что приходит в бот и что из него можно сделать.
//
//  • «Ученик сдал ДЗ» — когда ученик дал ответ на все задачи задания
//    (сколько верно, сколько ждут проверки).
//  • «Занятие закончилось — было или не было?» с кнопками прямо в чате:
//    нажатие отмечает занятие, как кнопка в кабинете (баланс оплат,
//    напоминание родителю об оплате).
//  • Утренняя сводка в 8:30 МСК и команда /today: занятия на сегодня,
//    работы на проверке, неотмеченные занятия, долги.
//
// Что именно слать, репетитор выбирает на странице «Настройки»
// (users.tg_notify_homework / tg_notify_lessons / tg_daily_digest).
// Относительные импорты: часть кода работает в воркере бота (tsx, вне Next.js).
import { and, eq, getTableColumns, gte, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "./db/client";
import * as schema from "./db/schema";
import {
  getUserById,
  pushNotification,
  getPendingReviewsForTeacher,
  getUnmarkedPastLessons,
  getScheduledLessonById,
  getStudentBalances,
} from "./queries";
import { sendTelegramMessage, callTelegram, escapeTelegramHtml as esc, InlineKeyboard } from "./telegram";
import { applyLessonStatus, LessonMark } from "./lesson-status";
import { isQuietHours } from "./lesson-reminders";
import { pluralRu } from "./pluralize";
import { getInactiveStudents, nudgeStudent } from "./nudge";
import type { User } from "./types";
import { collapseGroupLessons, groupTitle } from "./lesson-collapse";
import { countDistinctLessons } from "./groups";
import { activeTeacherLinks, lockStudent, withActiveTeacherDeliveries, withUnchangedTeacherRoster } from "./student-links";
import { debtText, hasDebt } from "./money";
import { reportButton, startTelegramReport } from "./lesson-report";

const TZ = "Europe/Moscow";
/** Через сколько после конца занятия спрашиваем «было или не было». */
const PROMPT_AFTER_END_MS = 10 * 60 * 1000;
/** Старше этого не спрашиваем — иначе после деплоя придёт пачка вопросов
 * про все давно прошедшие неотмеченные занятия. */
const PROMPT_MAX_AGE_MS = 24 * 3600 * 1000;
/** Утренняя сводка — с 8:30 до 12:00 МСК (если воркер был выключен утром,
 * сводка придёт позже, но не вечером, когда она уже бесполезна). */
const DIGEST_FROM_MIN = 8 * 60 + 30;
const DIGEST_TO_MIN = 12 * 60;

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
}

function mskParts(d: Date) {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => f.find((p) => p.type === t)!.value;
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

function mskTime(d: Date): string {
  return d.toLocaleTimeString("ru-RU", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
}

function mskDateLong(d: Date): string {
  return d.toLocaleDateString("ru-RU", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
}

function mskDateShort(d: Date): string {
  return d.toLocaleDateString("ru-RU", { timeZone: TZ, day: "numeric", month: "long" });
}

function openLink(path: string, label = "Открыть в приложении →"): string {
  const base = appUrl();
  return base ? `\n\n<a href="${base}${path}">${label}</a>` : "";
}

// ---------------------------------------------------------------- ДЗ сдано

/**
 * Вызывается после каждого ответа ученика в режиме задания. Если этим
 * ответом ученик закрыл задание (ответил на все задачи), репетитор получает
 * уведомление. Повторно по тому же заданию не шлём — проверяем по ссылке в
 * уже отправленных уведомлениях (в ней id задания).
 */
export async function notifyHomeworkIfFinished(student: User, problemId: string): Promise<void> {
  if (!student.teacherId) return;

  const hws = await db
    .select()
    .from(schema.homeworks)
    .where(
      and(
        eq(schema.homeworks.studentId, student.id),
        eq(schema.homeworks.teacherId, student.teacherId),
        sql`${schema.homeworks.problemIds} @> ${JSON.stringify([problemId])}::jsonb`
      )
    );
  if (hws.length === 0) return;

  for (const hw of hws) {
    const ids = hw.problemIds;
    if (ids.length === 0 || !hw.teacherId) continue;
    const link = `/teacher/student/${student.id}?hw=${hw.id}`;

    const alreadyNotified = and(eq(schema.notifications.userId, hw.teacherId),
      eq(schema.notifications.type, "homework_completed"), eq(schema.notifications.link, link));
    const already = await db
      .select({ id: schema.notifications.id })
      .from(schema.notifications)
      .where(alreadyNotified)
      .limit(1);
    if (already.length) continue;

    const rows = await db
      .select({
        problemId: schema.attempts.problemId,
        isCorrect: schema.attempts.isCorrect,
        reviewStatus: schema.attempts.reviewStatus,
      })
      .from(schema.attempts)
      .where(
        and(
          eq(schema.attempts.studentId, student.id),
          eq(schema.attempts.source, "assignment"),
          inArray(schema.attempts.problemId, ids)
        )
      );
    const answered = new Set(rows.map((r) => r.problemId));
    if (answered.size < ids.length) continue;

    const correct = new Set(rows.filter((r) => r.isCorrect).map((r) => r.problemId)).size;
    const pending = new Set(rows.filter((r) => r.reviewStatus === "pending").map((r) => r.problemId)).size;
    const overdue = hw.dueDate.getTime() < Date.now();

    const teacher = await getUserById(hw.teacherId);
    if (!teacher) continue;

    const parts = [`Верно ${correct} из ${ids.length}`];
    if (pending > 0) parts.push(`на проверке ${pending} ${pluralRu(pending, ["решение", "решения", "решений"])}`);
    if (overdue) parts.push(`срок был ${mskDateShort(hw.dueDate)}`);

    await db.transaction(async (tx) => {
      const current = await lockStudent(tx, student.id);
      if (current?.teacherId !== teacher.id || current.teacherLinkVersion !== student.teacherLinkVersion) return;
      if ((await tx.select({ id: schema.notifications.id }).from(schema.notifications).where(alreadyNotified).limit(1)).length) return;
      await pushNotification(tx, {
        userId: teacher.id,
        type: "homework_completed",
        title: `${student.name} сдал(а) «${hw.title}»`,
        body: parts.join(" · "),
        link,
        telegramPreference: "tgNotifyHomework",
        teacherLink: { studentId: student.id, teacherId: teacher.id, version: current.teacherLinkVersion },
      });
    });
  }
}

// ------------------------------------------- Занятие прошло: было / не было?

function lessonPromptText(studentName: string, startsAt: Date, durationMin: number, topic: string | null) {
  const end = new Date(startsAt.getTime() + durationMin * 60000);
  return (
    `<b>Занятие закончилось</b>\n${esc(studentName)} · ${mskDateShort(startsAt)}, ${mskTime(startsAt)}–${mskTime(end)}` +
    (topic ? `\nТема: ${esc(topic)}` : "")
  );
}

function groupPromptText(groupName: string | null, names: string[], startsAt: Date, durationMin: number, topic: string | null) {
  const end = new Date(startsAt.getTime() + durationMin * 60000);
  return (
    `<b>Занятие закончилось</b>\n👥 ${esc(groupTitle(groupName))} · ${mskDateShort(startsAt)}, ${mskTime(startsAt)}–${mskTime(end)}` +
    `\n${esc(names.join(", "))}` +
    (topic ? `\nТема: ${esc(topic)}` : "")
  );
}

function groupKeyboard(groupLessonId: string): InlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: "✅ Были все", callback_data: `lg:d:${groupLessonId}` },
        { text: "✖️ Не было", callback_data: `lg:c:${groupLessonId}` },
      ],
    ],
  };
}

function lessonKeyboard(lessonId: string): InlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: "✅ Было", callback_data: `ls:d:${lessonId}` },
        { text: "✖️ Не было", callback_data: `ls:c:${lessonId}` },
      ],
    ],
  };
}

/** Раз в несколько минут из воркера бота. Возвращает число отправленных вопросов. */
export async function sendLessonStatusPrompts(
  now: Date = new Date(),
  send: (chatId: string, text: string, options: { replyMarkup: InlineKeyboard }, tx: typeof db) => Promise<boolean> = sendTelegramMessage,
  beforeDispatch: (teacherId: string) => Promise<void> = async () => {},
): Promise<number> {
  if (isQuietHours(now)) return 0;

  const claimed = await db
    .update(schema.scheduledLessons)
    .set({ teacherPromptedAt: now })
    .where(
      and(
        eq(schema.scheduledLessons.status, "planned"),
        isNull(schema.scheduledLessons.teacherPromptedAt),
        isNull(schema.scheduledLessons.archivedAt),
        sql`exists (select 1 from users where id = ${schema.scheduledLessons.studentId} and teacher_id = ${schema.scheduledLessons.teacherId})`,
        sql`${schema.scheduledLessons.startsAt} + make_interval(mins => ${schema.scheduledLessons.durationMin}) <= ${new Date(now.getTime() - PROMPT_AFTER_END_MS)}`,
        gte(schema.scheduledLessons.startsAt, new Date(now.getTime() - PROMPT_MAX_AGE_MS))
      )
    )
    .returning({ ...getTableColumns(schema.scheduledLessons),
      version: sql<string | null>`(select teacher_link_version from users where id = ${schema.scheduledLessons.studentId})`,
    });

  let sent = 0;
  // Групповое занятие — один вопрос на всю группу, а не по сообщению на ученика.
  const groupRows = new Map<string, typeof claimed>();
  for (const l of claimed) if (l.groupLessonId) groupRows.set(l.groupLessonId, [...(groupRows.get(l.groupLessonId) ?? []), l]);
  for (const [groupLessonId, rows] of groupRows) {
    try {
      const first = rows[0];
      const teacher = await getUserById(first.teacherId);
      if (!teacher?.telegramChatId || teacher.tgNotifyLessons === false) continue;
      const links = rows.flatMap((row) => row.version ? [{ studentId: row.studentId, teacherId: row.teacherId, version: row.version }] : []);
      if (links.length !== rows.length) continue;
      await beforeDispatch(teacher.id);
      const sentGroup = await withActiveTeacherDeliveries(links, async (tx) => {
        const users = await tx.select({ name: schema.users.name, groupName: schema.studentGroups.name })
          .from(schema.scheduledLessons).innerJoin(schema.users, eq(schema.users.id, schema.scheduledLessons.studentId))
          .leftJoin(schema.studentGroups, eq(schema.studentGroups.id, schema.scheduledLessons.groupId))
          .where(and(inArray(schema.scheduledLessons.id, rows.map((row) => row.id)),
            isNull(schema.scheduledLessons.archivedAt), eq(schema.scheduledLessons.status, "planned")));
        if (!users.length) return false;
        const names = users.map((row) => row.name.split(" ")[0]).sort((a, b) => a.localeCompare(b, "ru"));
        const body = groupPromptText(users[0].groupName, names, first.startsAt, first.durationMin, first.topic) +
          `\n\nЕсли кого-то не было — отметьте в кабинете, ему занятие не засчитается.` +
          openLink(first.groupId ? `/teacher/groups/${first.groupId}` : "/teacher/schedule", "Отметить посещаемость →");
        return send(teacher.telegramChatId!, body, { replyMarkup: groupKeyboard(groupLessonId) }, tx);
      }, { id: teacher.id, telegram: { chatId: teacher.telegramChatId, preference: "tgNotifyLessons" } });
      if (sentGroup) sent++;
    } catch (e) {
      console.error("[teacher-telegram] не удалось спросить про групповое занятие", groupLessonId, e);
    }
  }
  for (const lesson of claimed) {
    if (lesson.groupLessonId || !lesson.version) continue;
    try {
      const teacher = await getUserById(lesson.teacherId);
      if (!teacher?.telegramChatId || teacher.tgNotifyLessons === false) continue;
      const link = { studentId: lesson.studentId, teacherId: lesson.teacherId, version: lesson.version };
      await beforeDispatch(teacher.id);
      if (await withActiveTeacherDeliveries([link], async (tx) => {
        const [active] = await tx.select({ name: schema.users.name }).from(schema.scheduledLessons)
          .innerJoin(schema.users, eq(schema.users.id, schema.scheduledLessons.studentId))
          .where(and(eq(schema.scheduledLessons.id, lesson.id), isNull(schema.scheduledLessons.archivedAt),
            eq(schema.scheduledLessons.status, "planned")));
        if (!active) return false;
        const body = lessonPromptText(active.name, lesson.startsAt, lesson.durationMin, lesson.topic) +
          "\n\nОтметьте, было ли занятие, — от этого зависит баланс оплат.";
        return send(teacher.telegramChatId!, body, { replyMarkup: lessonKeyboard(lesson.id) }, tx);
      }, { id: teacher.id, telegram: { chatId: teacher.telegramChatId, preference: "tgNotifyLessons" } })) sent++;
    } catch (e) {
      console.error("[teacher-telegram] не удалось спросить про занятие", lesson.id, e);
    }
  }
  return sent;
}

/** Название группы и имена учеников группового занятия. */
async function findTeacherByChat(chatId: string) {
  const rows = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.telegramChatId, chatId), eq(schema.users.role, "TEACHER")))
    .limit(1);
  return rows[0] ? await getUserById(rows[0].id) : undefined;
}

/** Нажатие кнопки под сообщением бота (callback_query). */
export async function handleCallbackQuery(cq: any, { telegram = callTelegram, markLesson = applyLessonStatus, nudge = nudgeStudent } = {}): Promise<void> {
  const data: string = cq?.data ?? "";
  const chatId: string | undefined = cq?.message?.chat?.id?.toString();
  const messageId: number | undefined = cq?.message?.message_id;
  const answer = (text: string) => telegram("answerCallbackQuery", { callback_query_id: cq.id, text });

  const answerBound = (id: string, chat: string, body: string) =>
    withActiveTeacherDeliveries([], () => answer(body), { id, telegram: { chatId: chat } });

  const nd = /^nd:(.+)$/.exec(data);
  if (nd && chatId) {
    const t = await findTeacherByChat(chatId);
    if (!t) {
      await answer("Этот Telegram не привязан к кабинету репетитора");
      return;
    }
    const r = await nudge(t.id, nd[1], new Date(), chatId);
    await answerBound(t.id, chatId,
      r.ok
        ? `Напоминание отправлено${r.viaTelegram ? " (в Telegram и в приложении)" : " (в приложении)"}`
        : r.reason === "too_soon"
          ? `Уже напоминали за последние сутки`
          : "Ученик не найден"
    );
    return;
  }

  const g = /^lg:([dc]):(.+)$/.exec(data);
  if (g && chatId) {
    const t = await findTeacherByChat(chatId);
    if (!t) {
      await answer("Этот Telegram не привязан к кабинету репетитора");
      return;
    }
    const status: LessonMark = g[1] === "d" ? "done" : "cancelled";
    const rows = await db
      .select({ lesson: schema.scheduledLessons, name: schema.users.name,
        groupName: schema.studentGroups.name, version: schema.users.teacherLinkVersion })
      .from(schema.scheduledLessons)
      .innerJoin(schema.users, eq(schema.users.id, schema.scheduledLessons.studentId))
      .leftJoin(schema.studentGroups, eq(schema.studentGroups.id, schema.scheduledLessons.groupId))
      .where(and(eq(schema.scheduledLessons.groupLessonId, g[2]), eq(schema.scheduledLessons.teacherId, t.id),
        eq(schema.users.teacherId, t.id), isNull(schema.scheduledLessons.archivedAt)));
    if (!rows.length) {
      await answer("Занятие не найдено");
      return;
    }
    // Только неотмеченные строки: если в кабинете уже отметили посещаемость,
    // кнопка из чата её не перезапишет.
    let changed = 0;
    for (const { lesson } of rows) {
      const res = await markLesson(t.id, lesson.id, status, { onlyIfPlanned: true, telegramChatId: chatId });
      if (res.ok) changed++;
    }
    const mark = status === "done" ? "✅ Отмечено: были все" : "✖️ Отмечено: занятия не было";
    const links = rows.map(({ lesson, version }) => ({ studentId: lesson.studentId, teacherId: t.id, version }));
    if (messageId) await withActiveTeacherDeliveries(links, async () => {
      const { lesson, groupName } = rows[0];
      const names = rows.map((row) => row.name.split(" ")[0]).sort((a, b) => a.localeCompare(b, "ru"));
      await telegram("editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text:
          groupPromptText(groupName, names, lesson.startsAt, lesson.durationMin, lesson.topic) +
          `\n\n<b>${changed ? mark : "Уже было отмечено раньше"}</b>`,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      });
    }, { id: t.id, telegram: { chatId } });
    await answerBound(t.id, chatId, changed ? mark : "Уже было отмечено раньше");
    return;
  }

  const rp = /^rp:(.+)$/.exec(data);
  if (rp && chatId) {
    const teacher = await findTeacherByChat(chatId);
    if (!teacher) {
      await answer("Этот Telegram не привязан к кабинету репетитора");
      return;
    }
    await answerBound(teacher.id, chatId, await startTelegramReport(teacher.id, chatId, rp[1]));
    return;
  }

  const m = /^ls:([dc]):(.+)$/.exec(data);
  if (!m || !chatId) {
    await answer("Кнопка устарела");
    return;
  }
  const teacher = await findTeacherByChat(chatId);
  if (!teacher) {
    await answer("Этот Telegram не привязан к кабинету репетитора");
    return;
  }

  const status: LessonMark = m[1] === "d" ? "done" : "cancelled";
  const [active] = await db.select({
    studentId: schema.users.id, name: schema.users.name, version: schema.users.teacherLinkVersion,
  }).from(schema.scheduledLessons).innerJoin(schema.users, eq(schema.users.id, schema.scheduledLessons.studentId))
    .where(and(eq(schema.scheduledLessons.id, m[2]), eq(schema.scheduledLessons.teacherId, teacher.id),
      eq(schema.users.teacherId, teacher.id), isNull(schema.scheduledLessons.archivedAt)));
  if (!active) {
    await answer("Занятие не найдено");
    return;
  }
  const res = await markLesson(teacher.id, m[2], status, { onlyIfPlanned: true, telegramChatId: chatId });
  if (!res.ok && res.reason === "not_found") {
    await answer("Занятие не найдено — возможно, его удалили");
    return;
  }

  const lesson = res.lesson!;
  const finalStatus = res.ok ? status : lesson.status;
  const mark = finalStatus === "done" ? "✅ Отмечено: было" : finalStatus === "cancelled" ? "✖️ Отмечено: не было" : "";
  const extra =
    res.ok && status === "done" ? openLink(`/teacher/student/${lesson.studentId}?log=${lesson.id}#journal`, "Или записать отчёт в кабинете →") : "";

  if (messageId) await withActiveTeacherDeliveries([{ studentId: active.studentId, teacherId: teacher.id, version: active.version }], async () => {
    // Убираем кнопки и пишем итог — чтобы по чату было видно, что уже отмечено.
    await telegram("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text:
        lessonPromptText(active.name, new Date(lesson.startsAt), lesson.durationMin, lesson.topic) +
        `\n\n<b>${mark}</b>${extra}`,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      // После «Было» — сразу кнопка отчёта: следующее сообщение станет отчётом.
      ...(res.ok && status === "done" ? { reply_markup: { inline_keyboard: [[reportButton(lesson.id)]] } } : {}),
    });
  }, { id: teacher.id, telegram: { chatId } });
  await answerBound(teacher.id, chatId, res.ok ? mark : `Уже было отмечено раньше`);
}

// ----------------------------------------------------- Сводка на сегодня

/** Текст «что сегодня»: для утренней сводки и для команды /today.
 * null — если сказать нечего (нет занятий, проверок, долгов). */
export async function buildTodayText(
  teacherId: string,
  now: Date = new Date(),
  { greeting = false } = {}
): Promise<{ text: string; replyMarkup?: InlineKeyboard } | null> {
  const { day } = mskParts(now);
  const dayStart = new Date(`${day}T00:00:00+03:00`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);

  const [lessons, pending, unmarked, balances, inactive] = await Promise.all([
    db
      .select({ lesson: schema.scheduledLessons, studentName: schema.users.name, groupName: schema.studentGroups.name })
      .from(schema.scheduledLessons)
      .innerJoin(schema.users, eq(schema.users.id, schema.scheduledLessons.studentId))
      .leftJoin(schema.studentGroups, eq(schema.studentGroups.id, schema.scheduledLessons.groupId))
      .where(
        and(
          eq(schema.scheduledLessons.teacherId, teacherId),
          eq(schema.users.teacherId, teacherId), isNull(schema.scheduledLessons.archivedAt),
          or(eq(schema.scheduledLessons.status, "planned"), eq(schema.scheduledLessons.status, "done")),
          gte(schema.scheduledLessons.startsAt, dayStart),
          lt(schema.scheduledLessons.startsAt, dayEnd)
        )
      )
      .orderBy(schema.scheduledLessons.startsAt),
    getPendingReviewsForTeacher(teacherId),
    getUnmarkedPastLessons(teacherId),
    getStudentBalances(teacherId),
    getInactiveStudents(teacherId, 3, now),
  ]);
  // Неотмеченные — только прошлых дней: сегодняшние и так в списке занятий.
  const unmarkedOld = unmarked.filter((l) => new Date(l.startsAt) < dayStart);
  const unmarkedOldCount = countDistinctLessons(unmarkedOld);
  const dayItems = collapseGroupLessons(
    lessons.map(({ lesson, studentName, groupName }) => ({ ...lesson, studentName, groupName }))
  );
  const debtors = balances.filter(hasDebt).sort((a, b) => a.balance - b.balance);

  if (lessons.length === 0 && pending.length === 0 && unmarkedOld.length === 0 && debtors.length === 0 && inactive.length === 0)
    return null;

  const lines: string[] = [];
  lines.push(`<b>${greeting ? "Доброе утро! " : ""}Сегодня, ${esc(mskDateLong(now))}</b>`);

  if (dayItems.length) {
    lines.push("", `📅 ${dayItems.length} ${pluralRu(dayItems.length, ["занятие", "занятия", "занятий"])}:`);
    for (const l of dayItems) {
      const done = l.status === "done" ? " ✅" : "";
      const end = new Date(l.startsAt.getTime() + l.durationMin * 60000);
      const who = l.members ? `👥 ${groupTitle(l.groupName)} (${l.members.length})` : l.studentName;
      lines.push(`${mskTime(l.startsAt)}–${mskTime(end)} — ${esc(who)}${l.topic ? ` · ${esc(l.topic)}` : ""}${done}`);
    }
  } else {
    lines.push("", "📅 Занятий сегодня нет");
  }
  if (pending.length) {
    lines.push(`📝 На проверке: ${pending.length} ${pluralRu(pending.length, ["решение", "решения", "решений"])}`);
  }
  if (unmarkedOldCount) {
    lines.push(`⏳ Не отмечено прошлых занятий: ${unmarkedOldCount}`);
  }
  if (debtors.length) {
    const names = debtors
      .slice(0, 3)
      .map((d) => `${esc(d.studentName.split(" ")[0])} (${d.balanceRub !== null ? debtText(d) : -d.balance})`)
      .join(", ");
    lines.push(`💸 Долги по занятиям: ${names}${debtors.length > 3 ? ` и ещё ${debtors.length - 3}` : ""}`);
  }
  if (inactive.length) {
    const names = inactive
      .slice(0, 3)
      .map((s) => `${esc(s.name.split(" ")[0])} (${s.neverActive ? "не начинал(а)" : `${s.idleDays} дн.`})`)
      .join(", ");
    lines.push(`😴 Давно не занимались: ${names}${inactive.length > 3 ? ` и ещё ${inactive.length - 3}` : ""}`);
  }
  // Кнопки «Напомнить» — тем, кому ещё не напоминали за сутки.
  const toNudge = inactive.filter((s) => !s.nudgedRecently).slice(0, 3);
  const replyMarkup: InlineKeyboard | undefined = toNudge.length
    ? { inline_keyboard: toNudge.map((s) => [{ text: `👋 Напомнить: ${s.name.split(" ")[0]}`, callback_data: `nd:${s.id}` }]) }
    : undefined;
  return { text: lines.join("\n") + openLink("/teacher", "Открыть кабинет →"), replyMarkup };
}

/** Раз в несколько минут из воркера: утренняя сводка, не чаще раза в день. */
export async function sendTeacherDigests(
  now: Date = new Date(), { send = sendTelegramMessage, beforeDispatch = async (_id: string) => {} } = {},
): Promise<number> {
  const { day, minutes } = mskParts(now);
  if (minutes < DIGEST_FROM_MIN || minutes >= DIGEST_TO_MIN) return 0;

  // Атомарно «забираем» сегодняшнюю сводку — второй воркер её не повторит.
  const claimed = await db
    .update(schema.users)
    .set({ digestSentOn: day })
    .where(
      and(
        eq(schema.users.role, "TEACHER"),
        isNotNull(schema.users.telegramChatId),
        eq(schema.users.tgDailyDigest, true),
        or(isNull(schema.users.digestSentOn), sql`${schema.users.digestSentOn} <> ${day}`)
      )
    )
    .returning({ id: schema.users.id, chatId: schema.users.telegramChatId });

  let sent = 0;
  for (const t of claimed) {
    try {
      const links = await activeTeacherLinks(t.id);
      const r = await buildTodayText(t.id, now, { greeting: true });
      if (!r || !t.chatId) continue;
      await beforeDispatch(t.id);
      if (await withUnchangedTeacherRoster(t.id, links, () =>
        send(t.chatId!, r.text, { replyMarkup: r.replyMarkup }),
        { id: t.id, telegram: { chatId: t.chatId, preference: "tgDailyDigest" } })) sent++;
    } catch (e) {
      console.error("[teacher-telegram] не удалось отправить сводку", t.id, e);
    }
  }
  return sent;
}

/** Команда /today в боте. */
export async function replyToday(chatId: string): Promise<void> {
  const teacher = await findTeacherByChat(chatId);
  if (!teacher) {
    await sendTelegramMessage(chatId, "Команда /today — для репетиторов. Подключите Telegram в кабинете репетитора.");
    return;
  }
  const links = await activeTeacherLinks(teacher.id);
  const r = await buildTodayText(teacher.id);
  await withUnchangedTeacherRoster(teacher.id, links, () => r
    ? sendTelegramMessage(chatId, r.text, { replyMarkup: r.replyMarkup })
    : sendTelegramMessage(chatId, `<b>Сегодня, ${esc(mskDateLong(new Date()))}</b>\n\nЗанятий нет, проверять нечего 🎉`), { id: teacher.id, telegram: { chatId } });
}
