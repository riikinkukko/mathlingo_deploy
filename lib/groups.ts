// Группы учеников репетитора. Сама группа — именованный список учеников;
// групповые занятия и задания хранятся строкой на каждого ученика (см.
// комментарий у studentGroups в schema.ts).
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import type { ScheduledLessonWithStudent } from "./types";
import { db } from "./db/client";
import * as schema from "./db/schema";

export interface GroupMember {
  id: string;
  name: string;
}

export interface StudentGroup {
  id: string;
  name: string;
  members: GroupMember[];
}

/** Все группы репетитора с составом (по алфавиту). */
export async function getGroupsOfTeacher(teacherId: string): Promise<StudentGroup[]> {
  const groups = await db
    .select({ id: schema.studentGroups.id, name: schema.studentGroups.name })
    .from(schema.studentGroups)
    .where(eq(schema.studentGroups.teacherId, teacherId))
    .orderBy(asc(schema.studentGroups.name));
  if (groups.length === 0) return [];
  const members = await db
    .select({
      groupId: schema.studentGroupMembers.groupId,
      id: schema.users.id,
      name: schema.users.name,
    })
    .from(schema.studentGroupMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.studentGroupMembers.studentId))
    .where(
      and(
        inArray(
          schema.studentGroupMembers.groupId,
          groups.map((g) => g.id)
        ),
        // Ученик, которого репетитор открепил, из группы тоже выпадает.
        eq(schema.users.teacherId, teacherId)
      )
    )
    .orderBy(asc(schema.users.name));
  return groups.map((g) => ({
    ...g,
    members: members.filter((m) => m.groupId === g.id).map(({ id, name }) => ({ id, name })),
  }));
}

/** Группа с составом — только если она принадлежит этому репетитору. */
export async function getGroupForTeacher(groupId: string, teacherId: string): Promise<StudentGroup | undefined> {
  if (!groupId) return undefined;
  return (await getGroupsOfTeacher(teacherId)).find((g) => g.id === groupId);
}

/** groupId → названия групп ученика (для чипов в списке учеников). */
export async function getGroupNamesByStudent(teacherId: string): Promise<Map<string, string[]>> {
  const groups = await getGroupsOfTeacher(teacherId);
  const out = new Map<string, string[]>();
  for (const g of groups) for (const m of g.members) out.set(m.id, [...(out.get(m.id) ?? []), g.name]);
  return out;
}

export interface GroupHomeworkRow {
  homeworkId: string;
  studentId: string;
  studentName: string;
}

export interface GroupHomeworkBatch {
  batchId: string;
  title: string;
  kind: "homework" | "test" | "exam";
  dueDate: string;
  createdAt: string;
  problemCount: number;
  rows: GroupHomeworkRow[];
}

/** Задания, выданные группе (новые сверху): одно на batch, внутри — копии учеников. */
export async function getGroupHomeworkBatches(groupId: string, teacherId: string, limit = 20): Promise<GroupHomeworkBatch[]> {
  const hw = await db
    .select({
      id: schema.homeworks.id,
      batchId: schema.homeworks.batchId,
      title: schema.homeworks.title,
      kind: schema.homeworks.kind,
      dueDate: schema.homeworks.dueDate,
      createdAt: schema.homeworks.createdAt,
      problemIds: schema.homeworks.problemIds,
      studentId: schema.homeworks.studentId,
      studentName: schema.users.name,
    })
    .from(schema.homeworks)
    .innerJoin(schema.users, eq(schema.users.id, schema.homeworks.studentId))
    .where(
      and(
        eq(schema.homeworks.groupId, groupId),
        eq(schema.homeworks.teacherId, teacherId),
        isNotNull(schema.homeworks.batchId)
      )
    )
    .orderBy(desc(schema.homeworks.createdAt), asc(schema.users.name));

  const batches: GroupHomeworkBatch[] = [];
  for (const h of hw) {
    let b = batches.find((x) => x.batchId === h.batchId);
    if (!b) {
      if (batches.length >= limit) continue;
      b = {
        batchId: h.batchId!,
        title: h.title,
        kind: h.kind,
        dueDate: h.dueDate.toISOString(),
        createdAt: h.createdAt.toISOString(),
        problemCount: h.problemIds.length,
        rows: [],
      };
      batches.push(b);
    }
    b.problemCount = Math.max(b.problemCount, h.problemIds.length);
    b.rows.push({ homeworkId: h.id, studentId: h.studentId!, studentName: h.studentName });
  }
  return batches;
}

/** Сколько групповых занятий (не строк!) в списке: строки одного занятия
 * группы имеют общий groupLessonId. */
export function countDistinctLessons(lessons: { id: string; groupLessonId?: string | null }[]): number {
  return new Set(lessons.map((l) => l.groupLessonId ?? l.id)).size;
}


/** Занятия группы: прошедшие неотмеченные и ближайшие запланированные (строки учеников). */
export async function getGroupLessons(
  groupId: string,
  teacherId: string,
  now: Date = new Date()
): Promise<{ unmarked: ScheduledLessonWithStudent[]; upcoming: ScheduledLessonWithStudent[] }> {
  const rows = await db
    .select({ l: schema.scheduledLessons, studentName: schema.users.name, groupName: schema.studentGroups.name })
    .from(schema.scheduledLessons)
    .innerJoin(schema.users, eq(schema.users.id, schema.scheduledLessons.studentId))
    .leftJoin(schema.studentGroups, eq(schema.studentGroups.id, schema.scheduledLessons.groupId))
    .where(
      and(
        eq(schema.scheduledLessons.groupId, groupId),
        eq(schema.scheduledLessons.teacherId, teacherId),
        eq(schema.scheduledLessons.status, "planned")
      )
    )
    .orderBy(asc(schema.scheduledLessons.startsAt), asc(schema.users.name))
    .limit(2000); // строки учеников: до 24 недель × 40 учеников
  const mapped: ScheduledLessonWithStudent[] = rows.map(({ l, studentName, groupName }) => ({
    id: l.id,
    teacherId: l.teacherId,
    studentId: l.studentId,
    startsAt: l.startsAt.toISOString(),
    durationMin: l.durationMin,
    topic: l.topic,
    status: l.status,
    seriesId: l.seriesId,
    groupId: l.groupId,
    groupLessonId: l.groupLessonId,
    createdAt: l.createdAt.toISOString(),
    studentName,
    groupName,
  }));
  return {
    unmarked: mapped.filter((l) => new Date(l.startsAt) <= now),
    upcoming: mapped.filter((l) => new Date(l.startsAt) > now),
  };
}
