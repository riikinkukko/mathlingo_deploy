import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getProblem, getUserById } from "@/lib/queries";
import type { Problem } from "@/lib/types";
import TeacherShell from "@/components/TeacherShell";
import MockResults from "@/components/mock/MockResults";
import { getMockAttemptById } from "@/lib/mock-queries";
import { MOCK_MODES, formatDuration, isMockMode, isPart1 } from "@/lib/mock-exam";

/** Пробник ученика глазами репетитора: разбор сданного или ход решения. */
export default async function TeacherMockPage(props: { params: Promise<{ id: string; mockId: string }> }) {
  const { id, mockId } = await props.params;
  const teacher = await getSessionUser();
  if (!teacher || teacher.role !== "TEACHER") notFound();
  const student = await getUserById(id);
  if (!student || student.role !== "STUDENT" || student.teacherId !== teacher.id) notFound();
  const m = await getMockAttemptById(mockId);
  if (!m || m.studentId !== student.id) notFound();

  const modeTitle = isMockMode(m.mode) ? MOCK_MODES[m.mode].title : "";
  const back = `/teacher/student/${student.id}#mocks`;

  if (!m.finishedAt) {
    const answered = Object.keys(m.answers).length;
    const part1 = m.items.filter((it) => isPart1(it.n));
    const part1Answered = part1.filter((it) => m.answers[it.problemId]).length;
    const left = m.deadlineAt ? Math.max(0, (new Date(m.deadlineAt).getTime() - Date.now()) / 1000) : null;
    const spent = Object.values(m.timeSpent).reduce((s, x) => s + x, 0);
    return (
      <TeacherShell active="students" title="Пробник">
        <div className="mx-auto max-w-3xl px-4 py-6 lg:px-8">
          <a href={back} className="text-sm font-bold text-ink-soft hover:text-pine">
            ← {student.name}
          </a>
          <div className="card mt-4 p-6">
            <h1 className="font-display text-xl font-black text-ink">
              {student.name} решает вариант {m.variant}
            </h1>
            <p className="mt-1 text-sm text-ink-soft">{modeTitle}. Разбор появится здесь, как только ученик сдаст работу.</p>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-paper p-3">
                <dt className="text-[12px] font-bold text-ink-soft">Ответов</dt>
                <dd className="font-display text-xl font-black text-ink">
                  {answered} из {m.items.length}
                </dd>
              </div>
              <div className="rounded-2xl bg-paper p-3">
                <dt className="text-[12px] font-bold text-ink-soft">Первая часть</dt>
                <dd className="font-display text-xl font-black text-ink">
                  {part1Answered} из {part1.length}
                </dd>
              </div>
              <div className="rounded-2xl bg-paper p-3">
                <dt className="text-[12px] font-bold text-ink-soft">{left != null ? "Осталось" : "Прошло"}</dt>
                <dd className="font-display text-xl font-black tabular-nums text-ink">{formatDuration(left ?? spent)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </TeacherShell>
    );
  }

  const problems = new Map<string, Problem>(
    (await Promise.all(m.items.map((it) => getProblem(it.problemId))))
      .filter((p): p is Problem => !!p)
      .map((p) => [p.id, p])
  );
  return (
    <TeacherShell active="students" title="Пробник">
      <div className="px-0 lg:px-4">
        <MockResults
          m={m}
          problems={problems}
          modeTitle={modeTitle}
          hasTeacher
          targetScore={student.targetScore ?? null}
          studentId={student.id}
          viewer="teacher"
          backHref={back}
          studentName={student.name}
        />
      </div>
    </TeacherShell>
  );
}
