// Метрики для владельца платформы (/admin/metrics): активность, удержание по
// неделям регистрации, воронка самостоятельных учеников и использование фич.
// Всё считается по московскому дню. Демо- и тестовые аккаунты не учитываются.
import { sql } from "drizzle-orm";
import { db } from "./db/client";

const DAY = `to_char(%s at time zone 'Europe/Moscow', 'YYYY-MM-DD')`;
const msk = (col: string) => DAY.replace("%s", col);
// Демо-аккаунты сида и тестовые адреса автотестов — не реальные люди.
const REAL = sql.raw(`u.email not like '%@demo.ru' and u.email not like '%@test.local' and u.email not like '%@lock.test' and u.email not like '%@example.ru' and u.email not like '%@example.com'`);

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

// ---------------------------------------------------------------- деньги и рост

/** Понедельник недели (по Москве) для колонки времени — только для имён колонок из кода. */
const weekOf = (col: string) => sql.raw(`to_char(date_trunc('week', ${col} at time zone 'Europe/Moscow'), 'YYYY-MM-DD')`);

export interface WeekRow {
  week: string;
  students: number; // сами зарегистрировались
  tutorStudents: number; // добавлены репетиторами
  tutors: number;
  studentsActivated: number; // решили хотя бы одну задачу
  tutorsActivated: number; // добавили хотя бы одного ученика
  paidCount: number;
  revenue: number;
  revenueTutors: number;
  revenueStudents: number;
}

/** Сводка по неделям (Пн–Вс по Москве): кто пришёл, кто начал пользоваться, сколько заплатили. */
export async function getWeekly(weeks = 8): Promise<WeekRow[]> {
  const since = sql.raw(`date_trunc('week', now() at time zone 'Europe/Moscow') - interval '${weeks - 1} weeks'`);
  const reg = await rows(sql`
    select ${weekOf("u.created_at")} as week,
      count(*) filter (where u.role = 'STUDENT' and u.teacher_id is null) as students,
      count(*) filter (where u.role = 'STUDENT' and u.teacher_id is not null) as tutor_students,
      count(*) filter (where u.role = 'TEACHER') as tutors,
      count(*) filter (where u.role = 'STUDENT' and u.teacher_id is null and exists (select 1 from attempts a where a.student_id = u.id)) as students_act,
      count(*) filter (where u.role = 'TEACHER' and exists (select 1 from users s where s.teacher_id = u.id)) as tutors_act
    from users u
    where ${REAL} and (u.created_at at time zone 'Europe/Moscow') >= ${since}
    group by 1
  `);
  const pay = await rows(sql`
    select ${weekOf("p.paid_at")} as week, count(*) as n, coalesce(sum(p.amount_rub), 0) as rub,
      coalesce(sum(p.amount_rub) filter (where p.payment_type = 'teacher_pro'), 0) as rub_t,
      coalesce(sum(p.amount_rub) filter (where p.payment_type <> 'teacher_pro'), 0) as rub_s
    from payments p join users u on u.id = p.user_id
    where p.status = 'succeeded' and p.paid_at is not null and ${REAL} and (p.paid_at at time zone 'Europe/Moscow') >= ${since}
    group by 1
  `);
  const byReg = new Map(reg.map((r) => [String(r.week), r]));
  const byPay = new Map(pay.map((r) => [String(r.week), r]));
  const out: WeekRow[] = [];
  const monday = new Date();
  const msk = new Date(monday.toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
  msk.setDate(msk.getDate() - ((msk.getDay() + 6) % 7));
  for (let i = 0; i < weeks; i++) {
    const d = new Date(msk);
    d.setDate(d.getDate() - 7 * i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const r = byReg.get(key) ?? {};
    const p = byPay.get(key) ?? {};
    out.push({
      week: key,
      students: num(r.students),
      tutorStudents: num(r.tutor_students),
      tutors: num(r.tutors),
      studentsActivated: num(r.students_act),
      tutorsActivated: num(r.tutors_act),
      paidCount: num(p.n),
      revenue: num(p.rub),
      revenueTutors: num(p.rub_t),
      revenueStudents: num(p.rub_s),
    });
  }
  return out;
}

/** Воронка репетиторов, зарегистрированных за days дней. */
export async function getTutorFunnel(days = 90) {
  const [r] = await rows(sql`
    with t as (
      select u.* from users u
      where u.role = 'TEACHER' and ${REAL} and u.created_at > now() - make_interval(days => ${days})
    ),
    cnt as (select s.teacher_id, count(*) as n from users s where s.role = 'STUDENT' group by 1)
    select count(*) as registered,
      count(*) filter (where t.email_verified_at is not null) as verified,
      count(*) filter (where coalesce((select n from cnt where cnt.teacher_id = t.id), 0) >= 1) as student1,
      count(*) filter (where exists (select 1 from scheduled_lessons l where l.teacher_id = t.id)
                         or exists (select 1 from homeworks h where h.teacher_id = t.id)) as used,
      count(*) filter (where coalesce((select n from cnt where cnt.teacher_id = t.id), 0) >= 3) as student3,
      count(*) filter (where exists (select 1 from payments p where p.user_id = t.id and p.status = 'succeeded')) as paid,
      count(*) filter (where t.teacher_trial_until > now()) as on_trial
    from t
  `);
  return {
    registered: num(r.registered),
    verified: num(r.verified),
    student1: num(r.student1),
    used: num(r.used),
    student3: num(r.student3),
    paid: num(r.paid),
    onTrial: num(r.on_trial),
  };
}

/** Деньги: выручка за месяц и прошлый месяц, действующие подписки. */
export async function getMoney() {
  const [r] = await rows(sql`
    with p as (
      select p.* from payments p join users u on u.id = p.user_id
      where p.status = 'succeeded' and p.paid_at is not null and ${REAL}
    )
    select
      coalesce(sum(amount_rub) filter (where date_trunc('month', paid_at at time zone 'Europe/Moscow') = date_trunc('month', now() at time zone 'Europe/Moscow')), 0) as this_month,
      coalesce(sum(amount_rub) filter (where date_trunc('month', paid_at at time zone 'Europe/Moscow') = date_trunc('month', now() at time zone 'Europe/Moscow') - interval '1 month'), 0) as prev_month,
      coalesce(sum(amount_rub), 0) as total,
      count(distinct user_id) as payers
    from p
  `);
  const [s] = await rows(sql`
    select
      count(*) filter (where u.role = 'STUDENT' and u.pro_until > now()) as students_pro,
      count(*) filter (where u.role = 'TEACHER' and u.teacher_pro_until > now() and u.teacher_plan <> 'free') as tutors_paid,
      count(*) filter (where u.role = 'TEACHER' and u.teacher_pro_until > now() and u.teacher_plan <> 'free' and u.yookassa_payment_method_id is not null) as tutors_autorenew
    from users u where ${REAL} and coalesce(u.is_platform_owner, false) = false
  `);
  return {
    thisMonth: num(r.this_month),
    prevMonth: num(r.prev_month),
    total: num(r.total),
    payers: num(r.payers),
    studentsPro: num(s.students_pro),
    tutorsPaid: num(s.tutors_paid),
    tutorsAutorenew: num(s.tutors_autorenew),
  };
}

/** Откуда приходят: источник и первая страница (за days дней), и сколько из них заплатили. */
export async function getSources(days = 90) {
  const r = await rows(sql`
    select coalesce(split_part(u.signup_source, '|', 1), 'не известно') as src,
      count(*) filter (where u.role = 'STUDENT') as students,
      count(*) filter (where u.role = 'TEACHER') as tutors,
      count(*) filter (where exists (select 1 from payments p where p.user_id = u.id and p.status = 'succeeded')) as paid
    from users u
    where ${REAL} and u.created_at > now() - make_interval(days => ${days})
      and (u.role = 'TEACHER' or (u.role = 'STUDENT' and u.teacher_id is null))
    group by 1 order by count(*) desc limit 15
  `);
  const pages = await rows(sql`
    select split_part(u.signup_source, '|', 2) as page, count(*) as n
    from users u
    where ${REAL} and u.created_at > now() - make_interval(days => ${days}) and u.signup_source like '%|%'
    group by 1 order by 2 desc limit 10
  `);
  return {
    sources: r.map((x) => ({ src: String(x.src || "не известно"), students: num(x.students), tutors: num(x.tutors), paid: num(x.paid) })),
    pages: pages.map((x) => ({ page: String(x.page || "/"), n: num(x.n) })),
  };
}
