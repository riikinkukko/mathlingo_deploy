/**
 * Шаблоны заданий репетитора: сохранённая подборка задач (из банка и свои)
 * с типом, подсказками и лимитом времени. Выдача по шаблону идёт через
 * обычный createHomeworkAction (app/actions.ts) с полем templateId.
 * Все функции проверяют, что шаблон принадлежит репетитору.
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "./db/client";
import * as schema from "./db/schema";
import { genId } from "./queries";
import type { AssignmentKind } from "./types";

export const TEMPLATES_MAX = 100;

export interface AssignmentTemplate {
  id: string;
  title: string;
  kind: AssignmentKind;
  allowHints: boolean;
  timeLimitMinutes: number | null;
  problemIds: string[];
  createdAt: string;
}

const map = (r: typeof schema.assignmentTemplates.$inferSelect): AssignmentTemplate => ({
  id: r.id,
  title: r.title,
  kind: r.kind as AssignmentKind,
  allowHints: r.allowHints,
  timeLimitMinutes: r.timeLimitMinutes,
  problemIds: r.problemIds,
  createdAt: r.createdAt.toISOString(),
});

export async function listTemplates(teacherId: string): Promise<AssignmentTemplate[]> {
  const rows = await db
    .select()
    .from(schema.assignmentTemplates)
    .where(eq(schema.assignmentTemplates.teacherId, teacherId))
    .orderBy(desc(schema.assignmentTemplates.createdAt));
  return rows.map(map);
}

export async function getTemplate(id: string, teacherId: string): Promise<AssignmentTemplate | null> {
  const [r] = await db
    .select()
    .from(schema.assignmentTemplates)
    .where(and(eq(schema.assignmentTemplates.id, id), eq(schema.assignmentTemplates.teacherId, teacherId)))
    .limit(1);
  return r ? map(r) : null;
}

/** Сохранить шаблон. null — достигнут лимит шаблонов или нет задач. */
export async function saveTemplate(
  teacherId: string,
  t: { title: string; kind: AssignmentKind; allowHints: boolean; timeLimitMinutes: number | null; problemIds: string[] }
): Promise<string | null> {
  if (t.problemIds.length === 0) return null;
  const existing = await db
    .select({ id: schema.assignmentTemplates.id })
    .from(schema.assignmentTemplates)
    .where(eq(schema.assignmentTemplates.teacherId, teacherId));
  if (existing.length >= TEMPLATES_MAX) return null;
  const id = genId("tpl");
  await db.insert(schema.assignmentTemplates).values({
    id,
    teacherId,
    title: t.title.trim().slice(0, 120) || "Шаблон",
    kind: t.kind,
    allowHints: t.allowHints,
    timeLimitMinutes: t.timeLimitMinutes,
    problemIds: t.problemIds.slice(0, 90),
  });
  return id;
}

/** Шаблон из уже выданного задания (только своего). */
export async function saveTemplateFromHomework(homeworkId: string, teacherId: string): Promise<string | null> {
  const [hw] = await db
    .select()
    .from(schema.homeworks)
    .where(and(eq(schema.homeworks.id, homeworkId), eq(schema.homeworks.teacherId, teacherId)))
    .limit(1);
  if (!hw) return null;
  return saveTemplate(teacherId, {
    title: hw.title,
    kind: hw.kind as AssignmentKind,
    allowHints: hw.allowHints,
    timeLimitMinutes: hw.timeLimitMinutes,
    problemIds: hw.problemIds,
  });
}

export async function deleteTemplate(id: string, teacherId: string): Promise<boolean> {
  const rows = await db
    .delete(schema.assignmentTemplates)
    .where(and(eq(schema.assignmentTemplates.id, id), eq(schema.assignmentTemplates.teacherId, teacherId)))
    .returning({ id: schema.assignmentTemplates.id });
  return rows.length > 0;
}
