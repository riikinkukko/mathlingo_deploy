import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getCurriculum, getProblemsForSkill, getUserById, getStudentsOfTeacher } from "@/lib/queries";
import TeacherShell from "@/components/TeacherShell";
import { createHomeworkAction } from "@/app/actions";
import AssignmentKindPicker from "./AssignmentKindPicker";
import CustomProblemBuilder from "./CustomProblemBuilder";
import SelectedSubmitBar from "./SelectedSubmitBar";
import QuickHomework from "@/components/QuickHomework";
import { weakSpotsSummary, availableExamNumbers } from "@/lib/quick-homework";
import { getGroupForTeacher, getGroupsOfTeacher } from "@/lib/groups";
import { addDaysKey, mskDayKey } from "@/lib/lesson-time";
import ScrollIntoViewOnMount from "@/components/teacher/ScrollIntoViewOnMount";

const ERROR_TEXT: Record<string, string> = {
  noproblems: "Задание не назначено: не выбрано ни одной задачи. Отметьте задачи из банка или добавьте свою.",
  notitle: "Задание не назначено: укажите название.",
  nodue: "Задание не назначено: укажите срок сдачи.",
  access: "Задание не назначено: ученик или группа не найдены. Откройте задание заново со страницы ученика.",
};

export default async function NewHomeworkPage(
  props: {
    searchParams: Promise<{
      studentId?: string;
      groupId?: string;
      quick?: string;
      error?: string;
      // восстановление полей после ошибки
      title?: string;
      dueDate?: string;
      kind?: string;
      timeLimitMinutes?: string;
      noHints?: string;
    }>;
  }
) {
  const searchParams = await props.searchParams;
  const teacher = (await getSessionUser())!;
  // Открыли без адресата (закладка, ручной ввод адреса) — вместо 404
  // предлагаем выбрать, кому задать.
  if (!searchParams.studentId && !searchParams.groupId) {
    const [students, groups] = await Promise.all([getStudentsOfTeacher(teacher.id), getGroupsOfTeacher(teacher.id)]);
    return (
      <TeacherShell active="students" title="Новое задание">
        <main className="mx-auto max-w-3xl px-4 pb-6 pt-6 lg:max-w-[1100px]">
          <h1 className="mb-1 font-display text-2xl font-black text-ink">Новое задание</h1>
          <p className="mb-5 text-sm text-ink-soft">Кому задать?</p>
          {students.length === 0 ? (
            <div className="card p-6 text-center text-sm text-ink-soft">
              Сначала добавьте ученика.{" "}
              <a href="/teacher/students/new" className="font-bold text-pine-dark underline">
                Добавить ученика
              </a>
            </div>
          ) : (
            <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-2 lg:space-y-0">
              {groups.filter((g) => g.members.length > 0).map((g) => (
                <a
                  key={g.id}
                  href={`/teacher/homework/new?groupId=${g.id}`}
                  className="flex min-h-[56px] items-center gap-3 rounded-[20px] border border-violet-border bg-violet-light/50 px-4 py-3 transition hover:border-violet"
                >
                  <span className="flex-1 font-display text-[15px] font-black text-ink">Группа «{g.name}»</span>
                  <span className="text-[12px] text-ink-soft">{g.members.length} уч.</span>
                  <span aria-hidden className="font-black text-violet">›</span>
                </a>
              ))}
              {students.map((st) => (
                <a
                  key={st.id}
                  href={`/teacher/homework/new?studentId=${st.id}`}
                  className="flex min-h-[56px] items-center gap-3 rounded-[20px] border border-line-soft bg-white px-4 py-3 transition hover:border-pine"
                >
                  <span className="flex-1 font-display text-[15px] font-black text-ink">{st.name}</span>
                  <span aria-hidden className="text-lg font-black text-ink-soft/60">›</span>
                </a>
              ))}
            </div>
          )}
        </main>
      </TeacherShell>
    );
  }
  // Задание одному ученику (?studentId=) или всей группе (?groupId=).
  const group = searchParams.groupId ? await getGroupForTeacher(searchParams.groupId, teacher.id) : undefined;
  const studentId = searchParams.studentId;
  const student = !group && studentId ? await getUserById(studentId) : undefined;
  if (group ? group.members.length === 0 : !student || student.role !== "STUDENT" || student.teacherId !== teacher.id) {
    notFound();
  }

  const [curriculum, weak, examNumbers] = await Promise.all([
    getCurriculum(),
    group ? Promise.resolve(null) : weakSpotsSummary(student!.id),
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
  // Через неделю — по московскому календарю (toISOString дал бы дату по UTC).
  const defaultDueStr = addDaysKey(mskDayKey(new Date()), 7);
  const errorText = searchParams.error
    ? ERROR_TEXT[searchParams.error] ?? "Не получилось назначить задание. Проверьте поля и попробуйте ещё раз."
    : undefined;
  const restored = !!searchParams.error;
  const restoredKind =
    searchParams.kind === "test" || searchParams.kind === "exam" || searchParams.kind === "homework"
      ? searchParams.kind
      : undefined;
  const restoredDue = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.dueDate ?? "") ? searchParams.dueDate : undefined;

  return (
    <TeacherShell active="students" title="Новое задание">
      <main className="mx-auto max-w-3xl px-4 pb-6 pt-6 lg:max-w-[1100px]">
        <h1 className="mb-1 font-display text-2xl font-black text-ink">
          Новое задание · {group ? `группа «${group.name}»` : student!.name}
        </h1>
        <p className="mb-6 text-sm text-ink-soft">
          {group
            ? `Задание получит каждый из ${group.members.length}: ${group.members.map((m) => m.name.split(" ")[0]).join(", ")}. Прогресс у каждого свой. Индивидуальное задание можно задать со страницы ученика.`
            : "Выберите тип задания, задачи и срок сдачи."}
        </p>

        {errorText && (
          <ScrollIntoViewOnMount
            role="alert"
            className="mb-5 rounded-2xl border-2 border-coral/40 bg-coral-light px-4 py-3 text-sm font-bold text-coral-text"
          >
            {errorText}
          </ScrollIntoViewOnMount>
        )}

        <QuickHomework
          studentId={student?.id}
          groupId={group?.id}
          weak={weak}
          numbers={examNumbers}
          notice={quickNotice}
        />

        <form action={createHomeworkAction} className="space-y-6">
          {group ? (
            <input type="hidden" name="groupId" value={group.id} />
          ) : (
            <input type="hidden" name="studentId" value={student!.id} />
          )}

          {/* Ручная сборка свёрнута: сверху быстрые задания, и три конкурирующие
              кнопки «Назначить» на одном экране сбивали с толку. После ошибки
              блок раскрыт, чтобы было видно, что исправить. */}
          <details id="manual" open={restored} className="group/manual scroll-mt-24 rounded-[20px] border border-line-soft bg-white">
            <summary className="flex min-h-[56px] cursor-pointer list-none items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block font-display text-[16px] font-black text-ink">Собрать задание вручную</span>
                <span className="block text-[13px] text-ink-soft">Тип, срок, задачи из банка и свои задачи</span>
              </span>
              <span aria-hidden className="text-lg font-black text-ink-soft transition group-open/manual:rotate-90">›</span>
            </summary>
            <div className="space-y-6 border-t border-line-soft px-4 pt-4">

          <AssignmentKindPicker
            defaultKind={restoredKind}
            defaultAllowHints={restored ? searchParams.noHints !== "1" : undefined}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="title">Название</label>
              <input className="input" id="title" name="title" required defaultValue={searchParams.title || "Практика по теме"} />
            </div>
            <div>
              <label className="label" htmlFor="dueDate">Срок сдачи</label>
              <input className="input" id="dueDate" name="dueDate" type="date" required defaultValue={restoredDue ?? defaultDueStr} />
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
                defaultValue={searchParams.timeLimitMinutes || undefined}
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
                                  <div className="space-y-2 px-2 pb-2 lg:grid lg:grid-cols-2 lg:gap-2 lg:space-y-0">
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
                                            <span className="ml-2 text-[11px] font-bold text-amber-dark">ЕГЭ №{p.egeTaskNumber}</span>
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
            </div>
          </details>
        </form>
      </main>
    </TeacherShell>
  );
}
