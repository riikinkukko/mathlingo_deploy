"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { genId, getUserById, pushNotification } from "@/lib/queries";
import { pickByNumbers, pickWeakProblems } from "@/lib/quick-homework";

const COUNTS = [5, 10, 15];
const DUE_DAYS = [3, 7];

/** «Домашка в один тап»: задачи подбираются автоматически, задание сразу назначается. */
export async function createQuickHomeworkAction(formData: FormData) {
  const teacher = await getSessionUser();
  const studentId = String(formData.get("studentId") || "");
  const back = `/teacher/homework/new?studentId=${studentId}`;
  if (!teacher || teacher.role !== "TEACHER") redirect(`${back}&error=1`);
  const student = await getUserById(studentId);
  if (!student || student.role !== "STUDENT" || student.teacherId !== teacher!.id) redirect(`${back}&error=1`);

  const mode = String(formData.get("mode")) === "numbers" ? "numbers" : "weak";
  const count = COUNTS.includes(Number(formData.get("count"))) ? Number(formData.get("count")) : 10;
  const dueDays = DUE_DAYS.includes(Number(formData.get("dueDays"))) ? Number(formData.get("dueDays")) : 7;
  const numbers = formData
    .getAll("numbers")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 30);

  if (mode === "numbers" && numbers.length === 0) redirect(`${back}&quick=nonumbers`);
  const problemIds =
    mode === "weak" ? await pickWeakProblems(studentId, count) : await pickByNumbers(studentId, numbers, count);
  if (problemIds.length === 0) redirect(`${back}&quick=empty`);

  const sorted = [...numbers].sort((a, b) => a - b);
  const title =
    mode === "weak"
      ? "Работа над ошибками"
      : `Практика: ${sorted.map((n) => `№${n}`).join(", ")}`;
  const due = new Date();
  due.setDate(due.getDate() + dueDays);
  due.setHours(23, 59, 0, 0);

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
      body: `${title} · ${problemIds.length} задач`,
      link: `/student/homework`,
    });
  });

  revalidatePath(`/teacher/student/${studentId}`);
  redirect(`/teacher/student/${studentId}?tab=hw&quick=${problemIds.length}`);
}
