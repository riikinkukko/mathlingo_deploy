import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getCurriculum, getProblemsForSkill, getUserById } from "@/lib/queries";
import TeacherShell from "@/components/TeacherShell";
import { createHomeworkAction } from "@/app/actions";
import AssignmentKindPicker from "./AssignmentKindPicker";
import CustomProblemBuilder from "./CustomProblemBuilder";
import SelectedSubmitBar from "./SelectedSubmitBar";
import QuickHomework from "@/components/QuickHomework";
import { weakSpotsSummary, availableExamNumbers } from "@/lib/quick-homework";

export default async function NewHomeworkPage({
  searchParams,
}: {
  searchParams: { studentId?: string; quick?: string };
}) {
  const teacher = (await getSessionUser())!;
  const studentId = searchParams.studentId;
  const student = studentId ? await getUserById(studentId) : undefined;
  if (!student || student.role !== "STUDENT" || student.teacherId !== teacher.id) {
    notFound();
  }

  const [curriculum, weak, examNumbers] = await Promise.all([
    getCurriculum(),
    weakSpotsSummary(student.id),
    availableExamNumbers(),
  ]);
  const quickNotice =
    searchParams.quick === "empty"
      ? "Подходящих нерешённых задач не нашлось — выберите другие номера или соберите задание вручную."
      : searchParams.quick === "nonumbers"
        ? "Отметьте хотя бы один номер ЕГЭ."
        : undefined;
  const allSkillsFlat = curriculum.flatMap((t) => t.chapters).flatMap((c) => c.skills);
  const problemsBySkill = new Map(
    await Promise.all(
      allSkillsFlat.map(async (skill) => [skill.id, await getProblemsForSkill(skill.id, true)] as const)
    )
  );
  const defaultDue = new Date();
  defaultDue.setDate(defaultDue.getDate() + 7);
  const defaultDueStr = defaultDue.toISOString().slice(0, 10);

  return (
    <TeacherShell active="students" title="Новое задание">
      <main className="mx-auto max-w-3xl px-4 pt-6">
        <h1 className="mb-1 font-display text-2xl font-black text-ink">
          Новое задание · {student.name}
        </h1>
        <p className="mb-6 text-sm text-ink-soft">
          Выберите тип задания, задачи и срок сдачи.
        </p>

        <QuickHomework studentId={student.id} weak={weak} numbers={examNumbers} notice={quickNotice} />

        <form action={createHomeworkAction} className="space-y-6">
          <input type="hidden" name="studentId" value={student.id} />

          <AssignmentKindPicker />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="title">Название</label>
              <input className="input" id="title" name="title" required defaultValue="Практика по теме" />
            </div>
            <div>
              <label className="label" htmlFor="dueDate">Срок сдачи</label>
              <input className="input" id="dueDate" name="dueDate" type="date" required defaultValue={defaultDueStr} />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="timeLimitMinutes">
                Лимит времени на выполнение (мин, необязательно)
              </label>
              <input
                className="input"
                id="timeLimitMinutes"
                name="timeLimitMinutes"
                type="number"
                min={1}
                placeholder="Например, 45 — актуально для контрольных и пробников"
              />
            </div>
          </div>

          {/* Ручной выбор: разделы и навыки свёрнуты, иначе это сотни задач подряд. */}
          <div>
            <p className="label">Задачи из банка</p>
            <div className="space-y-2">
              {curriculum.map(({ topic, chapters }) => {
                const topicSkills = chapters.flatMap((c) => c.skills);
                const topicCount = topicSkills.reduce((n, sk) => n + (problemsBySkill.get(sk.id)?.length ?? 0), 0);
                if (topicCount === 0) return null;
                return (
                  <details key={topic.id} className="group rounded-2xl border border-line-soft bg-white">
                    <summary className="flex min-h-[52px] cursor-pointer list-none items-center gap-3 px-4 py-3">
                      <span className="flex-1 font-display text-[15px] font-black text-ink">{topic.title}</span>
                      <span className="text-[12px] font-bold text-ink-soft">{topicCount}</span>
                      <span aria-hidden className="text-ink-soft transition group-open:rotate-90">›</span>
                    </summary>
                    <div className="space-y-4 border-t border-line-soft px-3 pb-3 pt-3">
                      {chapters.map(({ chapter, skills }) => (
                        <div key={chapter.id}>
                          {chapters.length > 1 && (
                            <p className="mb-1.5 px-1 text-xs font-extrabold uppercase tracking-wide text-ink-soft">
                              {chapter.title}
                            </p>
                          )}
                          <div className="space-y-1.5">
                            {skills.map((skill) => {
                              const problems = problemsBySkill.get(skill.id) ?? [];
                              if (problems.length === 0) return null;
                              return (
                                <details key={skill.id} className="group/skill rounded-xl bg-paper">
                                  <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 px-3 py-2">
                                    <span className="flex-1 text-sm font-bold text-ink">{skill.title}</span>
                                    <span className="text-[12px] text-ink-soft">{problems.length}</span>
                                    <span aria-hidden className="text-ink-soft transition group-open/skill:rotate-90">›</span>
                                  </summary>
                                  <div className="space-y-2 px-2 pb-2">
                                    {problems.map((p) => (
                                      <label
                                        key={p.id}
                                        className="card flex cursor-pointer items-start gap-3 p-3 text-sm hover:border-pine has-[:checked]:border-pine has-[:checked]:bg-pine-light/40"
                                      >
                                        <input
                                          type="checkbox"
                                          name="problemIds"
                                          value={p.id}
                                          className="mt-0.5 h-5 w-5 shrink-0 accent-pine"
                                        />
                                        <span className="text-ink-soft">
                                          <span className="text-ink">{p.text}</span>
                                          {p.egeTaskNumber && (
                                            <span className="ml-2 text-[11px] text-amber">ЕГЭ №{p.egeTaskNumber}</span>
                                          )}
                                          {p.answerType === "DETAILED" && (
                                            <span className="ml-2 text-[11px] text-violet">развёрнутый ответ</span>
                                          )}
                                        </span>
                                      </label>
                                    ))}
                                  </div>
                                </details>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
          </div>

          <CustomProblemBuilder />

          <SelectedSubmitBar />
        </form>
      </main>
    </TeacherShell>
  );
}
