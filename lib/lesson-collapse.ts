// Групповое занятие хранится строкой на каждого ученика (общий groupLessonId).
// В расписании репетитора такие строки сворачиваются в одно занятие группы.
import type { LessonStatus } from "./types";

export interface LessonMember {
  lessonId: string;
  studentId: string;
  studentName: string;
  status: LessonStatus;
}

type Row = {
  id: string;
  studentId: string;
  status: LessonStatus;
  groupLessonId: string | null;
  studentName?: string;
  groupName?: string | null;
};

export type CollapsedLesson<T extends Row> = T & {
  /** только у группового занятия: все ученики со своим статусом */
  members?: LessonMember[];
};

/** Сворачивает строки одного группового занятия (порядок сохраняется по первой строке). */
export function collapseGroupLessons<T extends Row>(rows: T[]): CollapsedLesson<T>[] {
  const out: CollapsedLesson<T>[] = [];
  const byGroupLesson = new Map<string, CollapsedLesson<T>>();
  for (const r of rows) {
    const member: LessonMember = {
      lessonId: r.id,
      studentId: r.studentId,
      studentName: r.studentName ?? "",
      status: r.status,
    };
    if (!r.groupLessonId) {
      out.push({ ...r });
      continue;
    }
    const existing = byGroupLesson.get(r.groupLessonId);
    if (existing) {
      existing.members!.push(member);
      continue;
    }
    const item: CollapsedLesson<T> = { ...r, members: [member] };
    byGroupLesson.set(r.groupLessonId, item);
    out.push(item);
  }
  for (const item of out) {
    if (!item.members) continue;
    item.members.sort((a, b) => a.studentName.localeCompare(b.studentName, "ru"));
    // Статус занятия группы: пока кто-то не отмечен — «planned»; иначе «done»,
    // если был хоть кто-то, и «cancelled», если не было никого.
    const st = item.members.map((m) => m.status);
    item.status = st.includes("planned") ? "planned" : st.includes("done") ? "done" : st.includes("missed") ? "missed" : "cancelled";
  }
  return out;
}

export function groupTitle(groupName: string | null | undefined): string {
  return groupName ? `Группа «${groupName}»` : "Групповое занятие";
}
