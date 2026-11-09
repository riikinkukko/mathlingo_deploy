/**
 * Данные для SEO-страниц /ege, /ege/zadanie-N, /ege/tema/<slug> из нашего
 * собственного банка задач: сколько задач, какие навыки, пример задачи с
 * разбором. Тексты страниц — в lib/seo/ege-content.ts.
 */
import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "../db/client";
import * as schema from "../db/schema";
import type { DiagramSpec } from "../types";

export const PART1_LAST = 13;

/** Первичные баллы за задание ЕГЭ-2027 (часть 2 — как в lib/ege-points.ts). */
export function pointsFor(n: number): number {
  const part2: Record<number, number> = { 14: 2, 15: 3, 16: 2, 17: 2, 18: 3, 19: 4, 20: 4 };
  return part2[n] ?? 1;
}

export interface SampleProblem {
  id: string;
  text: string;
  answerType: string;
  correctAnswer: string;
  explanation: string;
  diagram: DiagramSpec | null;
  skillTitle: string;
}

export interface TaskStats {
  n: number;
  problems: number;
  skills: { id: string; title: string; count: number }[];
  topics: string[];
}

/** Сводка по всем номерам одним запросом (для хаба и перелинковки). */
export async function getAllTaskStats(): Promise<Map<number, TaskStats>> {
  const rows = (
    await db.execute(sql`
      select p.ege_task_number as n, s.id as skill_id, s.title as skill_title, t.title as topic_title, count(*)::int as cnt
      from ${schema.problems} p
      join ${schema.skills} s on s.id = p.skill_id
      join ${schema.subtopics} c on c.id = s.subtopic_id
      join ${schema.topics} t on t.id = c.topic_id
      where p.ege_task_number is not null
      group by 1, 2, 3, 4
      order by 1, cnt desc`)
  ).rows as { n: number; skill_id: string; skill_title: string; topic_title: string; cnt: number }[];
  const map = new Map<number, TaskStats>();
  for (const r of rows) {
    const n = Number(r.n);
    const st = map.get(n) ?? { n, problems: 0, skills: [], topics: [] };
    st.problems += Number(r.cnt);
    st.skills.push({ id: r.skill_id, title: r.skill_title, count: Number(r.cnt) });
    if (!st.topics.includes(r.topic_title)) st.topics.push(r.topic_title);
    map.set(n, st);
  }
  return map;
}

/**
 * Пример задачи номера: из основных (не «банковских») задач, с чертежом если
 * есть, стабильный — один и тот же при каждой сборке страницы.
 */
export async function getSampleProblem(n: number): Promise<SampleProblem | null> {
  const rows = await db
    .select({
      id: schema.problems.id,
      text: schema.problems.text,
      answerType: schema.problems.answerType,
      correctAnswer: schema.problems.correctAnswer,
      explanation: schema.problems.explanation,
      diagram: schema.problems.diagram,
      tier: schema.problems.tier,
      skillTitle: schema.skills.title,
    })
    .from(schema.problems)
    .innerJoin(schema.skills, eq(schema.skills.id, schema.problems.skillId))
    .where(and(eq(schema.problems.egeTaskNumber, n), isNotNull(schema.problems.explanation)))
    .orderBy(asc(schema.problems.id))
    .limit(200);
  if (!rows.length) return null;
  const score = (r: (typeof rows)[number]) =>
    (r.tier !== "bank" ? 2 : 0) + (r.diagram ? 1 : 0) + (r.explanation && r.explanation.length > 40 ? 1 : 0);
  const best = [...rows].sort((a, b) => score(b) - score(a))[0];
  return {
    id: best.id,
    text: best.text,
    answerType: best.answerType,
    correctAnswer: best.correctAnswer,
    explanation: best.explanation ?? "",
    diagram: (best.diagram as DiagramSpec | null) ?? null,
    skillTitle: best.skillTitle,
  };
}

export interface TopicStats {
  title: string;
  problems: number;
  chapters: { title: string; skills: string[] }[];
}

/** Главы и навыки темы по точному названию темы в базе. */
export async function getTopicStats(topicTitle: string): Promise<TopicStats | null> {
  const [topic] = await db.select().from(schema.topics).where(eq(schema.topics.title, topicTitle)).limit(1);
  if (!topic) return null;
  const chapters = await db
    .select()
    .from(schema.subtopics)
    .where(eq(schema.subtopics.topicId, topic.id))
    .orderBy(asc(schema.subtopics.order));
  const skills = chapters.length
    ? await db
        .select()
        .from(schema.skills)
        .where(
          inArray(
            schema.skills.subtopicId,
            chapters.map((c) => c.id)
          )
        )
        .orderBy(asc(schema.skills.order))
    : [];
  const [cnt] = skills.length
    ? await db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.problems)
        .where(
          inArray(
            schema.problems.skillId,
            skills.map((s) => s.id)
          )
        )
    : [{ n: 0 }];
  return {
    title: topic.title,
    problems: Number(cnt?.n ?? 0),
    chapters: chapters.map((c) => ({ title: c.title, skills: skills.filter((s) => s.subtopicId === c.id).map((s) => s.title) })),
  };
}
