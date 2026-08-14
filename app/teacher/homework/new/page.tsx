import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getCurriculum, getProblemsForSkill, getUserById } from "@/lib/queries";
import AppHeader from "@/components/AppHeader";
import { createHomeworkAction } from "@/app/actions";
import AssignmentKindPicker from "./AssignmentKindPicker";
import CustomProblemBuilder from "./CustomProblemBuilder";

export default async function NewHomeworkPage({
  searchParams,
}: {
  searchParams: { studentId?: string };
}) {
  const teacher = (await getSessionUser())!;
  const studentId = searchParams.studentId;
  const student = studentId ? await getUserById(studentId) : undefined;
  if (!student || student.role !== "STUDENT" || student.teacherId !== teacher.id) {
    notFound();
  }

  const curriculum = await getCurriculum();
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
    <div className="min-h-screen pb-16">
      <AppHeader
        user={teacher}
        crumbs={[
          { label: "Мои ученики", href: "/teacher" },
          { label: student.name, href: `/teacher/student/${student.id}` },
          { label: "Новое задание" },
        ]}
      />
      <main className="mx-auto max-w-3xl px-4">
        <h1 className="mb-1 font-display text-2xl font-black text-ink">
          Задание для {student.name}
        </h1>
        <p className="mb-6 text-sm text-ink-soft">
          Выберите тип задания, задачи и срок сдачи.
        </p>

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

          <div className="space-y-6">
            {curriculum.flatMap((t) => t.chapters).map(({ chapter, skills }) => (
              <div key={chapter.id}>
                <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-ink-soft">
                  {chapter.title}
                </p>
                <div className="space-y-4">
                  {skills.map((skill) => {
                    const problems = problemsBySkill.get(skill.id) ?? [];
                    return (
                      <div key={skill.id}>
                        <p className="mb-1.5 text-sm font-bold text-ink">{skill.title}</p>
                        <div className="space-y-2">
                          {problems.map((p) => (
                            <label
                              key={p.id}
                              className="card flex cursor-pointer items-start gap-3 p-3 text-sm hover:border-pine"
                            >
                              <input
                                type="checkbox"
                                name="problemIds"
                                value={p.id}
                                className="mt-0.5 h-4 w-4 accent-pine"
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
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <CustomProblemBuilder />

          <button className="btn-primary" type="submit">
            Назначить задание
          </button>
        </form>
      </main>
    </div>
  );
}
