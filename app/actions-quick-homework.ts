"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { genId, getUserById, pushNotification } from "@/lib/queries";
import { pickByNumbers, pickWeakProblems } from "@/lib/quick-homework";
import { getGroupForTeacher } from "@/lib/groups";
import { addDaysKey, mskDayKey, mskEndOfDay } from "@/lib/lesson-time";
import { pluralRu } from "@/lib/pluralize";

const COUNTS = [5, 10, 15];
const DUE_DAYS = [3, 7];

/** «Домашка в один тап»: задачи подбираются автоматически, задание сразу назначается. */
export async function createQuickHomeworkAction(formData: FormData) {
  if (formData.get("groupId")) return createQuickGroupHomework(formData);
  const teacher = await getSessionUser();
  const studentId = String(formData.get("studentId") || "");
  const back = `/teacher/homework/new?studentId=${studentId}`;
  if (!teacher || teacher.role !== "TEACHER") redirect(`${back}&error=1`);
  const student = await getUserById(studentId);
  if (!student || student.role !== "STUDENT" || student.teacherId !== teacher!.id) redirect(`${back}&error=1`);

  const mode = String(formData.get("mode")) === "numbers" ? "numbers" : "weak";
  const count = COUNTS.includes(Number(formData.get("count"))) ? Number(formData.get("count")) : 10;
  const dueDays = DUE_DAYS.includes(Number(formData.get("dueDays"))) ? Number(formData.get("dueDays")) : 7;
  const numbers = Array.from(
    new Set(
      formData
        .getAll("numbers")
        .slice(0, 100)
        .map(Number)
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 30)
    )
  );

  if (mode === "numbers" && numbers.length === 0) redirect(`${back}&quick=nonumbers`);
  const problemIds =
    mode === "weak" ? await pickWeakProblems(studentId, count) : await pickByNumbers(studentId, numbers, count);
  if (problemIds.length === 0) redirect(`${back}&quick=empty`);

  const sorted = [...numbers].sort((a, b) => a - b);
  const title =
    mode === "weak"
      ? "Работа над ошибками"
      : `Практика: ${sorted.map((n) => `№${n}`).join(", ")}`;
  // До конца дня по Москве (сервер работает в UTC — setHours дал бы 02:59 МСК следующего дня).
  const due = mskEndOfDay(addDaysKey(mskDayKey(new Date()), dueDays));

  await db.transaction(async (tx) => {
    await tx.insert(schema.homeworks).values({
      id: genId("h"),
      teacherId: teacher!.id,
      studentId,
      title,
      kind: "homework",
      allowHints: true,
      timeLimitMinutes: null,
      audience: "assigned",
      problemIds,
      dueDate: due,
    });
    await pushNotification(tx, {
      userId: studentId,
      type: "assignment_created",
      title: "Новое домашнее задание",
      body: `${title} · ${problemIds.length} ${pluralRu(problemIds.length, ["задача", "задачи", "задач"])}`,
      link: `/student/homework`,
    });
  });

  revalidatePath(`/teacher/student/${studentId}`);
  redirect(`/teacher/student/${studentId}?tab=hw&quick=${problemIds.length}`);
}

/**
 * Быстрое задание группе. «По слабым местам» — каждому свои задачи (его
 * ошибки), «по номерам» — одинаковые задачи всей группе. У всех копий общий
 * batchId: на странице группы это одно задание с прогрессом каждого.
 */
async function createQuickGroupHomework(formData: FormData) {
  const teacher = await getSessionUser();
  const groupId = String(formData.get("groupId") || "");
  const back = `/teacher/homework/new?groupId=${groupId}`;
  if (!teacher || teacher.role !== "TEACHER") redirect(`${back}&error=1`);
  const group = await getGroupForTeacher(groupId, teacher!.id);
  if (!group || group.members.length === 0) redirect(`${back}&error=1`);

  const mode = String(formData.get("mode")) === "numbers" ? "numbers" : "weak";
  const count = COUNTS.includes(Number(formData.get("count"))) ? Number(formData.get("count")) : 10;
  const dueDays = DUE_DAYS.includes(Number(formData.get("dueDays"))) ? Number(formData.get("dueDays")) : 7;
  const numbers = Array.from(
    new Set(
      formData
        .getAll("numbers")
        .slice(0, 100)
        .map(Number)
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 30)
    )
  );
  if (mode === "numbers" && numbers.length === 0) redirect(`${back}&quick=nonumbers`);

  const memberIds = group!.members.map((m) => m.id);
  const perStudent = new Map<string, string[]>();
  if (mode === "numbers") {
    const common = await pickByNumbers(memberIds, numbers, count);
    for (const id of memberIds) perStudent.set(id, common);
  } else {
    for (const id of memberIds) perStudent.set(id, await pickWeakProblems(id, count));
  }
  const targets = memberIds.filter((id) => (perStudent.get(id) ?? []).length > 0);
  if (targets.length === 0) redirect(`${back}&quick=empty`);

  const sorted = [...numbers].sort((a, b) => a - b);
  const title = mode === "weak" ? "Работа над ошибками" : `Практика: ${sorted.map((n) => `№${n}`).join(", ")}`;
  // До конца дня по Москве (сервер работает в UTC — setHours дал бы 02:59 МСК следующего дня).
  const due = mskEndOfDay(addDaysKey(mskDayKey(new Date()), dueDays));
  const batchId = genId("hb");

  await db.transaction(async (tx) => {
    for (const studentId of targets) {
      const problemIds = perStudent.get(studentId)!;
      await tx.insert(schema.homeworks).values({
        id: genId("h"),
        teacherId: teacher!.id,
        studentId,
        title,
        kind: "homework",
        allowHints: true,
        timeLimitMinutes: null,
        audience: "assigned",
        problemIds,
        dueDate: due,
        groupId: group!.id,
        batchId,
      });
      await pushNotification(tx, {
        userId: studentId,
        type: "assignment_created",
        title: "Новое домашнее задание",
        body: `${title} · ${problemIds.length} ${pluralRu(problemIds.length, ["задача", "задачи", "задач"])}`,
        link: `/student/homework`,
      });
    }
  });

  for (const id of targets) revalidatePath(`/teacher/student/${id}`);
  revalidatePath(`/teacher/groups/${group!.id}`);
  redirect(`/teacher/groups/${group!.id}?hw=${targets.length}${targets.length < memberIds.length ? `&hwskip=${memberIds.length - targets.length}` : ""}`);
}
