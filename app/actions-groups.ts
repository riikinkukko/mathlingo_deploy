"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { genId } from "@/lib/queries";
import { getGroupForTeacher } from "@/lib/groups";

const MAX_NAME = 60;
const MAX_MEMBERS = 40;

/** Из формы — только свои ученики (studentIds можно подделать). */
async function ownStudentIds(teacherId: string, raw: string[]): Promise<string[]> {
  const ids = Array.from(new Set(raw.filter(Boolean))).slice(0, MAX_MEMBERS);
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        inArray(schema.users.id, ids),
        eq(schema.users.teacherId, teacherId),
        eq(schema.users.role, "STUDENT")
      )
    );
  return rows.map((r) => r.id);
}

function revalidateGroups(groupId?: string) {
  revalidatePath("/teacher/groups");
  if (groupId) revalidatePath(`/teacher/groups/${groupId}`);
  revalidatePath("/teacher");
  revalidatePath("/teacher/schedule");
}

export async function createGroupAction(formData: FormData) {
  const teacher = await getSessionUser();
  if (!teacher || teacher.role !== "TEACHER") redirect("/login");
  const name = String(formData.get("name") || "").trim().slice(0, MAX_NAME);
  const members = await ownStudentIds(teacher.id, formData.getAll("studentIds").map(String));
  if (!name) redirect("/teacher/groups?error=name");
  if (members.length < 2) redirect("/teacher/groups?error=members");

  const id = genId("grp");
  await db.transaction(async (tx) => {
    await tx.insert(schema.studentGroups).values({ id, teacherId: teacher.id, name });
    await tx.insert(schema.studentGroupMembers).values(members.map((studentId) => ({ groupId: id, studentId })));
  });
  revalidateGroups(id);
  redirect(`/teacher/groups/${id}?created=1`);
}

export async function updateGroupAction(formData: FormData) {
  const teacher = await getSessionUser();
  if (!teacher || teacher.role !== "TEACHER") redirect("/login");
  const groupId = String(formData.get("groupId") || "");
  const group = await getGroupForTeacher(groupId, teacher.id);
  if (!group) redirect("/teacher/groups?error=1");

  const name = String(formData.get("name") || "").trim().slice(0, MAX_NAME) || group.name;
  const members = await ownStudentIds(teacher.id, formData.getAll("studentIds").map(String));
  if (members.length < 2) redirect(`/teacher/groups/${groupId}?error=members`);

  // Состав меняется только на будущее: прошлые занятия и выданные задания
  // остаются у тех учеников, у кого они были.
  await db.transaction(async (tx) => {
    await tx.update(schema.studentGroups).set({ name }).where(eq(schema.studentGroups.id, groupId));
    await tx.delete(schema.studentGroupMembers).where(eq(schema.studentGroupMembers.groupId, groupId));
    await tx.insert(schema.studentGroupMembers).values(members.map((studentId) => ({ groupId, studentId })));
  });
  revalidateGroups(groupId);
  redirect(`/teacher/groups/${groupId}?saved=1`);
}

export async function deleteGroupAction(formData: FormData) {
  const teacher = await getSessionUser();
  if (!teacher || teacher.role !== "TEACHER") redirect("/login");
  const groupId = String(formData.get("groupId") || "");
  const group = await getGroupForTeacher(groupId, teacher.id);
  if (!group) redirect("/teacher/groups?error=1");

  // Занятия и задания учеников не удаляем: от проведённых занятий зависит
  // баланс оплат, а домашка — это работа ученика. У них просто обнулится
  // groupId (ON DELETE SET NULL).
  await db
    .delete(schema.studentGroups)
    .where(and(eq(schema.studentGroups.id, groupId), eq(schema.studentGroups.teacherId, teacher.id)));
  revalidateGroups();
  redirect("/teacher/groups?deleted=1");
}
