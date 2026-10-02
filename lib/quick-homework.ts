// «Домашка в один тап»: подбор задач из банка для ученика.
//  • weak — работа над ошибками: сначала задачи, где ученик ошибся и так и не
//    решил, затем нерешённые задачи тех же номеров ЕГЭ;
//  • numbers — выбранные номера ЕГЭ, задачи распределяются поровну.
// Берём только задачи банка (с навыком), которые ученик ещё не решил верно.
import { sql } from "drizzle-orm";
import { db } from "./db/client";

type Row = { id: string; n: number | null };

async function rows(q: ReturnType<typeof sql>): Promise<Row[]> {
  const r = await db.execute(q);
  return (r.rows as { id: string; n: number | null }[]).map((x) => ({ id: x.id, n: x.n === null ? null : Number(x.n) }));
}

/** Сводка для карточки «По слабым местам»: сколько нерешённых ошибок и какие номера. */
export async function weakSpotsSummary(studentId: string): Promise<{ mistakes: number; numbers: number[] }> {
  const r = await db.execute(sql`
    with st as (
      select problem_id, bool_or(is_correct) as c, bool_or(not is_correct) as w
      from attempts where student_id = ${studentId} group by 1
    )
    select p.ege_task_number as n, count(*)::int as k
    from problems p join st on st.problem_id = p.id
    where st.w and not st.c and p.skill_id is not null
    group by 1 order by 2 desc
  `);
  const list = r.rows as { n: number | null; k: number }[];
  return {
    mistakes: list.reduce((s, x) => s + Number(x.k), 0),
    numbers: list.filter((x) => x.n !== null).map((x) => Number(x.n)),
  };
}

export async function pickWeakProblems(studentId: string, count: number): Promise<string[]> {
  const mistakes = await rows(sql`
    with st as (
      select problem_id, bool_or(is_correct) as c, bool_or(not is_correct) as w, max(created_at) as last
      from attempts where student_id = ${studentId} group by 1
    )
    select p.id, p.ege_task_number as n
    from problems p join st on st.problem_id = p.id
    where st.w and not st.c and p.skill_id is not null
    order by st.last desc
  `);
  const chosen = mistakes.slice(0, count).map((r) => r.id);
  if (chosen.length >= count) return chosen;

  const numbers = Array.from(new Set(mistakes.map((m) => m.n).filter((n): n is number => n !== null)));
  if (numbers.length === 0) return chosen;
  const more = await rows(sql`
    select p.id, p.ege_task_number as n
    from problems p
    where p.skill_id is not null
      and p.ege_task_number in (${sql.join(numbers.map((n) => sql`${n}`), sql`, `)})
      and not exists (select 1 from attempts a where a.problem_id = p.id and a.student_id = ${studentId} and a.is_correct)
    order by random()
  `);
  for (const r of more) {
    if (chosen.length >= count) break;
    if (!chosen.includes(r.id)) chosen.push(r.id);
  }
  return chosen;
}

export async function pickByNumbers(studentId: string, numbers: number[], count: number): Promise<string[]> {
  if (numbers.length === 0) return [];
  const all = await rows(sql`
    select p.id, p.ege_task_number as n
    from problems p
    where p.skill_id is not null
      and p.ege_task_number in (${sql.join(numbers.map((n) => sql`${n}`), sql`, `)})
      and not exists (select 1 from attempts a where a.problem_id = p.id and a.student_id = ${studentId} and a.is_correct)
    order by random()
  `);
  // Поровну по номерам: по кругу берём по одной задаче каждого номера.
  const byN = new Map<number, string[]>();
  for (const r of all) {
    if (r.n === null) continue;
    byN.set(r.n, [...(byN.get(r.n) ?? []), r.id]);
  }
  const queues = numbers.map((n) => byN.get(n) ?? []);
  const out: string[] = [];
  while (out.length < count && queues.some((q) => q.length)) {
    for (const q of queues) {
      if (out.length >= count) break;
      const id = q.shift();
      if (id) out.push(id);
    }
  }
  return out;
}

/** Номера ЕГЭ, по которым в банке есть задачи (для чипов выбора). */
export async function availableExamNumbers(): Promise<number[]> {
  const r = await db.execute(sql`
    select distinct ege_task_number as n from problems
    where ege_task_number is not null and skill_id is not null order by 1
  `);
  return (r.rows as { n: number }[]).map((x) => Number(x.n));
}
