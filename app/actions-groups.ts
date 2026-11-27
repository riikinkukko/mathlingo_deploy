"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { lockTeacherStudents } from "@/lib/student-links";
import * as schema from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { genId } from "@/lib/queries";
import { getGroupForTeacher } from "@/lib/groups";

const MAX_NAME = 60;
const MAX_MEMBERS = 40;

function requestedMembers(formData: FormData): string[] {
  return Array.from(new Set(formData.getAll("studentIds").map(String).filter(Boolean))).slice(0, MAX_MEMBERS);
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
  if (!name) redirect("/teacher/groups?error=name");

  const id = genId("grp");
  await db.transaction(async (tx) => {
    const members = await lockTeacherStudents(tx, teacher.id, requestedMembers(formData));
    if (members.length < 2) redirect("/teacher/groups?error=members");
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

  // Состав меняется только на будущее: прошлые занятия и выданные задания
  // остаются у тех учеников, у кого они были.
  await db.transaction(async (tx) => {
    const members = await lockTeacherStudents(tx, teacher.id, requestedMembers(formData));
    if (members.length < 2) redirect(`/teacher/groups/${groupId}?error=members`);
    const [updated] = await tx.update(schema.studentGroups).set({ name })
      .where(and(eq(schema.studentGroups.id, groupId), eq(schema.studentGroups.teacherId, teacher.id)))
      .returning({ id: schema.studentGroups.id });
    if (!updated) redirect("/teacher/groups?error=1");
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
