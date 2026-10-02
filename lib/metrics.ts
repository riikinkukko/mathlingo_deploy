// Метрики для владельца платформы (/admin/metrics): активность, удержание по
// неделям регистрации, воронка самостоятельных учеников и использование фич.
// Всё считается по московскому дню. Демо- и тестовые аккаунты не учитываются.
import { sql } from "drizzle-orm";
import { db } from "./db/client";

const DAY = `to_char(%s at time zone 'Europe/Moscow', 'YYYY-MM-DD')`;
const msk = (col: string) => DAY.replace("%s", col);
// Демо-аккаунты сида и тестовые адреса автотестов — не реальные люди.
const REAL = sql.raw(`u.email not like '%@demo.ru' and u.email not like '%@test.local' and u.email not like '%@lock.test'`);

type Row = Record<string, unknown>;
const rows = async (q: ReturnType<typeof sql>) => (await db.execute(q)).rows as Row[];
const num = (v: unknown) => Number(v ?? 0);

export async function getActivity() {
  const [r] = await rows(sql`
    with a as (
      select a.student_id, a.created_at, (u.teacher_id is null) as standalone
      from attempts a join users u on u.id = a.student_id
      where ${REAL} and a.created_at > now() - interval '30 days'
    )
    select
      count(distinct student_id) filter (where ${sql.raw(msk("created_at"))} = ${sql.raw(msk("now()"))}) as dau,
      count(distinct student_id) filter (where created_at > now() - interval '7 days') as wau,
      count(distinct student_id) as mau,
      count(distinct student_id) filter (where created_at > now() - interval '7 days' and standalone) as wau_standalone,
      count(*) filter (where created_at > now() - interval '7 days') as attempts_week
    from a
  `);
  return { dau: num(r.dau), wau: num(r.wau), mau: num(r.mau), wauStandalone: num(r.wau_standalone), attemptsWeek: num(r.attempts_week) };
}

export type Cohort = {
  week: string; // понедельник недели регистрации, YYYY-MM-DD
  users: number;
  day0: number; // решили задачу в день регистрации
  week1: number | null; // вернулись на 2–7 день (null — неделя ещё не прошла)
  month1: number | null; // вернулись на 8–30 день
};

/** Удержание учеников по неделям регистрации (последние 8 недель). */
export async function getCohorts(): Promise<Cohort[]> {
  const r = await rows(sql`
    with u as (
      select u.id, (u.created_at at time zone 'Europe/Moscow')::date as reg
      from users u
      where u.role = 'STUDENT' and ${REAL} and u.created_at > now() - interval '8 weeks'
    ),
    d as (
      select distinct a.student_id, (a.created_at at time zone 'Europe/Moscow')::date as day
      from attempts a join u on u.id = a.student_id
    )
    select to_char(date_trunc('week', u.reg), 'YYYY-MM-DD') as week,
           count(*) as users,
           count(*) filter (where exists (select 1 from d where d.student_id = u.id and d.day = u.reg)) as day0,
           count(*) filter (where exists (select 1 from d where d.student_id = u.id and d.day between u.reg + 1 and u.reg + 7)) as week1,
           count(*) filter (where exists (select 1 from d where d.student_id = u.id and d.day between u.reg + 8 and u.reg + 30)) as month1,
           max(u.reg) as last_reg
    from u group by 1 order by 1 desc
  `);
  const today = new Date();
  return r.map((x) => {
    const lastReg = new Date(String(x.last_reg));
    const age = Math.floor((today.getTime() - lastReg.getTime()) / 86400000);
    return {
      week: String(x.week),
      users: num(x.users),
      day0: num(x.day0),
      week1: age >= 7 ? num(x.week1) : null,
      month1: age >= 30 ? num(x.month1) : null,
    };
  });
}

/** Воронка самостоятельных учеников, зарегистрированных за 30 дней. */
export async function getStandaloneFunnel() {
  const [r] = await rows(sql`
    with u as (
      select u.id, u.target_score, u.dream_university
      from users u
      where u.role = 'STUDENT' and u.teacher_id is null and ${REAL} and u.created_at > now() - interval '30 days'
    ),
    days as (
      select a.student_id, count(distinct (a.created_at at time zone 'Europe/Moscow')::date) as n
      from attempts a join u on u.id = a.student_id group by 1
    )
    select count(*) as registered,
           count(*) filter (where target_score is not null or dream_university is not null) as onboarded,
           count(*) filter (where exists (select 1 from days where days.student_id = u.id)) as first_attempt,
           count(*) filter (where exists (select 1 from days where days.student_id = u.id and days.n >= 3)) as active3,
           count(*) filter (where exists (select 1 from payments p where p.user_id = u.id and p.status = 'succeeded')) as paid
    from u
  `);
  return {
    registered: num(r.registered),
    onboarded: num(r.onboarded),
    firstAttempt: num(r.first_attempt),
    active3: num(r.active3),
    paid: num(r.paid),
  };
}

/** Сколько раз за 30 дней сработали фичи удержания и связи. */
export async function getFeatureUsage() {
  const [r] = await rows(sql`
    select
      (select count(*) from streak_freeze_days f join users u on u.id = f.student_id where ${REAL} and f.created_at > now() - interval '30 days') as freezes_used,
      (select count(*) from notifications n join users u on u.id = n.user_id where ${REAL} and n.type = 'teacher_nudge' and n.created_at > now() - interval '30 days') as nudges,
      (select count(*) from notifications n join users u on u.id = n.user_id where ${REAL} and n.type = 'weekly_report' and n.created_at > now() - interval '30 days') as weekly_reports,
      (select count(*) from student_questions q join users u on u.id = q.student_id where ${REAL} and q.created_at > now() - interval '30 days') as questions,
      (select count(*) from student_questions q join users u on u.id = q.student_id where ${REAL} and q.answered_at is not null and q.created_at > now() - interval '30 days') as questions_answered,
      (select count(*) from homeworks h join users u on u.id = h.student_id where ${REAL} and h.created_at > now() - interval '30 days') as homeworks
  `);
  const tg = await rows(sql`
    select u.role, count(*) as total, count(*) filter (where u.telegram_chat_id is not null) as linked
    from users u where ${REAL} group by 1
  `);
  const streaks = await rows(sql`
    with d as (
      select a.student_id, (a.created_at at time zone 'Europe/Moscow')::date as day
      from attempts a join users u on u.id = a.student_id
      where ${REAL} and a.created_at > now() - interval '40 days'
      group by 1, 2
      union
      select f.student_id, f.day::date from streak_freeze_days f
    ),
    g as (
      select student_id, day, day - (row_number() over (partition by student_id order by day))::int as grp from d
    ),
    runs as (
      select student_id, count(*) as len, max(day) as last_day from g group by student_id, grp
    )
    select
      count(*) filter (where len >= 3) as s3,
      count(*) filter (where len >= 7) as s7
    from runs
    where last_day >= (now() at time zone 'Europe/Moscow')::date - 1
  `);
  return {
    freezesUsed: num(r.freezes_used),
    nudges: num(r.nudges),
    weeklyReports: num(r.weekly_reports),
    questions: num(r.questions),
    questionsAnswered: num(r.questions_answered),
    homeworks: num(r.homeworks),
    telegram: Object.fromEntries(tg.map((x) => [String(x.role), { total: num(x.total), linked: num(x.linked) }])) as Record<
      string,
      { total: number; linked: number }
    >,
    streak3: num(streaks[0]?.s3),
    streak7: num(streaks[0]?.s7),
  };
}

export async function getTeacherStats() {
  const [r] = await rows(sql`
    select count(*) as teachers,
           count(*) filter (where exists (select 1 from users s where s.teacher_id = u.id)) as with_students,
           count(*) filter (where exists (select 1 from homeworks h where h.teacher_id = u.id and h.created_at > now() - interval '7 days')
                             or exists (select 1 from scheduled_lessons l where l.teacher_id = u.id and l.created_at > now() - interval '7 days')) as active_week,
           count(*) filter (where u.teacher_plan = 'pro') as pro
    from users u where u.role = 'TEACHER' and ${REAL}
  `);
  return { teachers: num(r.teachers), withStudents: num(r.with_students), activeWeek: num(r.active_week), pro: num(r.pro) };
}
