// Напоминания репетитору об окончании пробного «Профи»: за 3 дня, в последний
// день и (если учеников больше бесплатного лимита) после окончания. Уходят в
// приложение, в Telegram (если привязан) и на почту. Работает в воркере бота
// (scripts/telegram-poller.ts) — поэтому импорты относительные.
//
// Повторы исключены: users.teacher_trial_reminded хранит последнюю ушедшую
// ступень и меняется атомарно (UPDATE … WHERE прежнее значение) до отправки.
import { and, eq, gt, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "./db/client";
import * as schema from "./db/schema";
import { pushNotification } from "./queries";
import { sendEmail } from "./email";
import { pluralRu } from "./pluralize";
import { TEACHER_FREE_LIMIT, TEACHER_TIERS } from "./teacher-plan";

export type TrialStage = "3d" | "last" | "ended";

const DAY = 86_400_000;
const TZ = "Europe/Moscow";
/** Шлём днём: 10:00–21:00 по Москве. */
const SEND_FROM_MIN = 10 * 60;
const SEND_TO_MIN = 21 * 60;

/**
 * Какое напоминание пора отправить (или null). Ступени идут по порядку, но
 * пропущенная не догоняется: если воркер стоял и уже последний день — сразу
 * «последний день», без «осталось 3 дня».
 */
export function trialStageDue(trialUntil: Date, now: Date, reminded: string | null): TrialStage | null {
  const left = trialUntil.getTime() - now.getTime();
  if (left > 3 * DAY) return null;
  if (left > DAY) return reminded ? null : "3d";
  if (left > 0) return reminded === "last" || reminded === "ended" ? null : "last";
  if (left > -3 * DAY) return reminded === "ended" ? null : "ended";
  return null;
}

function mskMinutes(d: Date): number {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const g = (t: string) => Number(f.find((p) => p.type === t)!.value);
  return g("hour") * 60 + g("minute");
}

function dateLong(d: Date): string {
  return d.toLocaleDateString("ru-RU", { timeZone: TZ, day: "numeric", month: "long" });
}

const STANDARD = TEACHER_TIERS.standard;
const PRO = TEACHER_TIERS.pro;
const PRICES = `«${STANDARD.name}» — ${STANDARD.month} ₽ в месяц до ${STANDARD.limit} учеников, «${PRO.name}» — ${PRO.month.toLocaleString("ru-RU")} ₽ без лимита.`;

export interface TrialMessage {
  title: string;
  body: string;
  link: string;
  /** false — только отметить ступень, ничего не отправлять */
  send: boolean;
}

/** Текст напоминания: зависит от ступени и того, сколько у репетитора учеников. */
export function trialMessage(stage: TrialStage, trialUntil: Date, students: number, now: Date): TrialMessage {
  const over = students > TEACHER_FREE_LIMIT;
  const studentsWord = `${students} ${pluralRu(students, ["ученик", "ученика", "учеников"])}`;
  const after =
    students === 0
      ? `Учеников вы пока не добавили — добавьте первого, чтобы попробовать расписание, домашки и проверку решений.`
      : over
        ? `Дальше — бесплатный тариф до ${TEACHER_FREE_LIMIT} учеников: ваши ${studentsWord} останутся с вами, но новых добавить не получится. ${PRICES}`
        : `Дальше — бесплатный тариф до ${TEACHER_FREE_LIMIT} учеников. У вас ${studentsWord}, так что ничего не изменится. Когда учеников станет больше, выберите тариф.`;
  const link = students === 0 ? "/teacher/students/new" : "/teacher/upgrade";

  if (stage === "3d") {
    const days = Math.max(2, Math.ceil((trialUntil.getTime() - now.getTime()) / DAY));
    return {
      title: `«${PRO.name}» бесплатно — ещё ${days} ${pluralRu(days, ["день", "дня", "дней"])}`,
      body: `Пробный период закончится ${dateLong(trialUntil)}. ${after}`,
      link,
      send: true,
    };
  }
  if (stage === "last") {
    return {
      title: `Сегодня последний день «${PRO.name}»`,
      body: `Пробный период заканчивается сегодня. ${after}`,
      link,
      send: true,
    };
  }
  // После окончания пишем только тем, кого это касается: учеников больше лимита.
  return {
    title: "Пробный период закончился",
    body: `Сейчас действует бесплатный тариф до ${TEACHER_FREE_LIMIT} учеников. Ваши ${studentsWord} остались с вами, но добавить нового ученика можно только на платном тарифе. ${PRICES}`,
    link: "/teacher/upgrade",
    send: over,
  };
}

function emailHtml(name: string, m: TrialMessage, appUrl: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const button = m.link === "/teacher/upgrade" ? "Выбрать тариф" : "Добавить ученика";
  return `
  <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#132A20">
    <p style="font-size:20px;font-weight:900;color:#0F5132;margin:0 0 24px">Планиметрика</p>
    <p style="font-size:16px;margin:0 0 8px">${esc(name)}, здравствуйте!</p>
    <p style="font-size:18px;font-weight:800;margin:0 0 12px">${esc(m.title)}</p>
    <p style="font-size:15px;line-height:1.5;margin:0 0 24px">${esc(m.body)}</p>
    <a href="${appUrl}${m.link}" style="display:inline-block;background:#1CAE6B;color:#fff;font-weight:800;text-decoration:none;padding:12px 22px;border-radius:12px">${button}</a>
    <p style="font-size:12px;color:#8A8F8C;margin-top:32px">Это письмо о вашем тарифе в Планиметрике. Оплата никогда не списывается без вашего согласия.</p>
  </div>`;
}

/** Один проход: найти репетиторов, которым пора напомнить, и отправить. */
export async function sendTrialReminders(now: Date = new Date()): Promise<number> {
  const m = mskMinutes(now);
  if (m < SEND_FROM_MIN || m >= SEND_TO_MIN) return 0;

  const candidates = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      trialUntil: schema.users.teacherTrialUntil,
      reminded: schema.users.teacherTrialReminded,
    })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.role, "TEACHER"),
        eq(schema.users.isPlatformOwner, false),
        isNotNull(schema.users.teacherTrialUntil),
        gt(schema.users.teacherTrialUntil, new Date(now.getTime() - 3 * DAY)),
        lt(schema.users.teacherTrialUntil, new Date(now.getTime() + 3 * DAY)),
        // Уже оплатившим не напоминаем.
        sql`not (${schema.users.teacherPlan} = 'pro' and (${schema.users.teacherProUntil} is null or ${schema.users.teacherProUntil} > ${now}))`,
        sql`coalesce(${schema.users.teacherTrialReminded}, '') <> 'ended'`
      )
    );

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://planimetrika.online").replace(/\/$/, "");
  let sent = 0;
  for (const c of candidates) {
    const stage = trialStageDue(c.trialUntil!, now, c.reminded);
    if (!stage) continue;
    // Атомарно занимаем ступень: второй экземпляр воркера сюда уже не пройдёт.
    const claimed = await db
      .update(schema.users)
      .set({ teacherTrialReminded: stage })
      .where(
        and(
          eq(schema.users.id, c.id),
          c.reminded === null ? sql`${schema.users.teacherTrialReminded} is null` : eq(schema.users.teacherTrialReminded, c.reminded)
        )
      )
      .returning({ id: schema.users.id });
    if (claimed.length === 0) continue;

    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.users)
      .where(and(eq(schema.users.teacherId, c.id), eq(schema.users.role, "STUDENT")));
    const msg = trialMessage(stage, c.trialUntil!, n, now);
    if (!msg.send) continue;

    await pushNotification(db, { userId: c.id, type: "plan_reminder", title: msg.title, body: msg.body, link: msg.link });
    try {
      await sendEmail({ to: c.email, subject: msg.title, html: emailHtml(c.name, msg, appUrl) });
    } catch (e) {
      console.error("[trial-reminders] письмо не ушло", c.id, e);
    }
    sent++;
  }
  return sent;
}
