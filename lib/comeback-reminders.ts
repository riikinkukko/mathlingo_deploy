// Письма «возвращайся» самостоятельному ученику (без репетитора), если он
// перестал заходить: через день, через 3 дня и через неделю после последней
// задачи — не больше трёх писем на один перерыв. Вернулся и снова пропал —
// цепочка начинается заново. У кого подключён Telegram с вечерними
// напоминаниями, письма не шлём: хватит одного канала.
//
// Повторы исключены: ступень меняется атомарно (UPDATE … WHERE прежняя
// ступень) до отправки. Отключается учеником в профиле (users.email_reminders).
// Работает в воркере бота (scripts/telegram-poller.ts) — импорты относительные.
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "./db/client";
import * as schema from "./db/schema";
import { sendEmail, isEmailConfigured } from "./email";

const TZ = "Europe/Moscow";
const HOUR = 3_600_000;
/** Письма — вечером, когда школьник дома: 17:00–20:00 по Москве. */
const SEND_FROM_MIN = 17 * 60;
const SEND_TO_MIN = 20 * 60;
/** Через сколько часов без задач уходит ступень 1, 2, 3. */
const STAGE_AFTER_H = [20, 68, 164];

export type ComebackStage = 1 | 2 | 3;

/** Какую ступень пора отправить (или null). Пропущенные ступени не догоняются. */
export function comebackStageDue(hoursIdle: number, sentStage: number): ComebackStage | null {
  let due: ComebackStage | null = null;
  STAGE_AFTER_H.forEach((h, i) => {
    if (hoursIdle >= h) due = (i + 1) as ComebackStage;
  });
  if (!due || due <= sentStage) return null;
  // Если воркер стоял — шлём только последнюю наступившую, а не все сразу.
  return due;
}

function mskMinutes(d: Date): number {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const g = (t: string) => Number(f.find((p) => p.type === t)!.value);
  return g("hour") * 60 + g("minute");
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
}

export interface ComebackMessage {
  subject: string;
  title: string;
  body: string;
  button: string;
}

/** Текст письма. Экспорт — для тестов. */
export function comebackMessage(
  stage: ComebackStage,
  ctx: { name: string; skillTitle: string | null; started: boolean }
): ComebackMessage {
  const first = ctx.name.split(" ")[0] || ctx.name;
  const where = ctx.skillTitle ? `Ты остановился(ась) на уроке «${ctx.skillTitle}» — продолжить можно с того же места.` : "";
  if (stage === 1) {
    if (!ctx.started) {
      return {
        subject: `${first}, первая задача — 2 минуты`,
        title: "Ты зарегистрировался(ась), но ещё не начал(а)",
        body: "Первый урок — короткая теория и 4 задачи с подсказками. Выбери тему, которую хочешь подтянуть, и попробуй одну задачу.",
        button: "Начать первый урок",
      };
    }
    return {
      subject: `${first}, 10 минут сегодня — и серия начнётся`,
      title: "Вчера ты начал(а) — сегодня главный день",
      body: `Привычка складывается на второй день, а не на первый. Реши сегодня хотя бы одну задачу — это 2–3 минуты. ${where}`.trim(),
      button: "Решить задачу",
    };
  }
  if (stage === 2) {
    return {
      subject: `${first}, задачи ЕГЭ ждут тебя`,
      title: "Три дня без задач — начнём заново?",
      body: `Не нужно наверстывать всё сразу: один урок на 10 минут вернёт тебя в ритм. ${where}`.trim(),
      button: "Вернуться к урокам",
    };
  }
  return {
    subject: `${first}, до ЕГЭ осталось меньше времени, чем кажется`,
    title: "Неделя без подготовки",
    body: `Если тема показалась скучной или сложной — выбери другую в разделе «Предметы»: начать можно с любой. ${where}`.trim(),
    button: "Выбрать, с чего начать",
  };
}

function emailHtml(m: ComebackMessage, link: string, base: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `
  <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#132A20">
    <p style="font-size:20px;font-weight:900;color:#0F5132;margin:0 0 24px">Планиметрика</p>
    <p style="font-size:18px;font-weight:800;margin:0 0 12px">${esc(m.title)}</p>
    <p style="font-size:15px;line-height:1.5;margin:0 0 24px">${esc(m.body)}</p>
    <a href="${base}${link}" style="display:inline-block;background:#1CAE6B;color:#fff;font-weight:800;text-decoration:none;padding:12px 22px;border-radius:12px">${esc(m.button)}</a>
    <p style="font-size:12px;color:#8A8F8C;margin-top:32px">
      Такие письма приходят, только когда ты давно не заходил(а), — не больше трёх подряд.
      Отключить их можно в <a href="${base}/student/profile" style="color:#8A8F8C">профиле</a>.
    </p>
  </div>`;
}

/** Один проход воркера. Возвращает число отправленных писем. */
export async function sendComebackEmails(now: Date = new Date()): Promise<number> {
  if (!isEmailConfigured()) return 0;
  const minutes = mskMinutes(now);
  if (minutes < SEND_FROM_MIN || minutes >= SEND_TO_MIN) return 0;

  // Кандидаты: самостоятельные ученики, письма не отключены, Telegram-напоминаний нет.
  const rows = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      createdAt: schema.users.createdAt,
      stage: schema.users.comebackStage,
      sentAt: schema.users.comebackSentAt,
      chatId: schema.users.telegramChatId,
      tgReminders: schema.users.tgStudentReminders,
      lastAt: sql<Date | null>`(select max(a.created_at) from attempts a where a.student_id = ${schema.users.id})`,
    })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.role, "STUDENT"),
        isNull(schema.users.teacherId),
        eq(schema.users.emailReminders, true),
        isNull(schema.users.deletionRequestedAt)
      )
    );

  const base = appUrl();
  let sent = 0;
  for (const u of rows) {
    if (!u.email || (u.chatId && u.tgReminders)) continue;
    const last = u.lastAt ? new Date(u.lastAt) : null;
    // Ни одной задачи — тоже «перерыв», считаем от регистрации.
    const idleFrom = last ?? new Date(u.createdAt);
    // Вернулся после прошлого письма — цепочка начинается заново.
    let sentStage = u.stage;
    if (sentStage > 0 && u.sentAt && last && last > new Date(u.sentAt)) sentStage = 0;
    // Не чаще одного письма в сутки.
    if (u.sentAt && now.getTime() - new Date(u.sentAt).getTime() < 20 * HOUR && sentStage > 0) continue;

    const stage = comebackStageDue((now.getTime() - idleFrom.getTime()) / HOUR, sentStage);
    if (!stage) continue;

    const claimed = await db
      .update(schema.users)
      .set({ comebackStage: stage, comebackSentAt: now })
      .where(and(eq(schema.users.id, u.id), eq(schema.users.comebackStage, u.stage)))
      .returning({ id: schema.users.id });
    if (claimed.length === 0) continue;

    try {
      const lastSkill = await db
        .select({ title: schema.skills.title, skillId: schema.skills.id })
        .from(schema.attempts)
        .innerJoin(schema.problems, eq(schema.problems.id, schema.attempts.problemId))
        .innerJoin(schema.skills, eq(schema.skills.id, schema.problems.skillId))
        .where(eq(schema.attempts.studentId, u.id))
        .orderBy(desc(schema.attempts.createdAt))
        .limit(1);
      const m = comebackMessage(stage, {
        name: u.name,
        skillTitle: lastSkill[0]?.title ?? null,
        started: !!last,
      });
      const link = stage === 3 ? "/student/subjects" : lastSkill[0] ? `/student/skill/${lastSkill[0].skillId}` : "/student";
      await sendEmail({ to: u.email, subject: m.subject, html: emailHtml(m, link, base) });
      sent++;
    } catch (e) {
      console.error("[comeback] письмо не ушло", u.id, e);
    }
  }
  return sent;
}
