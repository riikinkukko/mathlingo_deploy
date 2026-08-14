import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getSkill, getChapter, getProblemsForSkill, countAttemptsForProblem } from "@/lib/queries";
import AppHeader from "@/components/AppHeader";
import TheoryCardsBuilder from "@/components/TheoryCardsBuilder";
import { updateSkillAction, deleteProblemAction } from "@/app/actions-content";

export default async function SkillEditPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string; deleteError?: string };
}) {
  const teacher = (await getSessionUser())!;
  const skill = await getSkill(params.id);
  if (!skill) notFound();
  const chapter = await getChapter(skill.subtopicId);
  const problems = await getProblemsForSkill(skill.id, true);
  const attemptCounts = await Promise.all(problems.map((p) => countAttemptsForProblem(p.id)));

  return (
    <div className="min-h-screen pb-16">
      <AppHeader
        user={teacher}
        crumbs={[
          { label: "Мои ученики", href: "/teacher" },
          { label: "Контент программы", href: "/teacher/content" },
          { label: skill.title },
        ]}
      />
      <main className="mx-auto max-w-2xl px-4">
        <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-ink-soft">
          {chapter?.title ?? "—"}
        </p>
        <h1 className="mb-6 font-display text-2xl font-black text-ink">{skill.title}</h1>

        {searchParams.error && (
          <div className="mb-4 rounded-2xl border-2 border-coral-light bg-coral-light p-3.5 text-sm font-bold text-coral">
            Не удалось сохранить — проверьте обязательные поля (название, минимум 1 карточка теории).
          </div>
        )}
        {searchParams.deleteError && (
          <div className="mb-4 rounded-2xl border-2 border-coral-light bg-coral-light p-3.5 text-sm font-bold text-coral">
            Нельзя удалить — по этой задаче уже есть попытки учеников, удаление стёрло бы их историю.
          </div>
        )}

        <form action={updateSkillAction} className="card mb-8 space-y-4 p-5">
          <input type="hidden" name="id" value={skill.id} />
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div>
              <label className="label" htmlFor="title">
                Название навыка
              </label>
              <input className="input" id="title" name="title" defaultValue={skill.title} required />
            </div>
            <div>
              <label className="label" htmlFor="order">
                Порядок в главе
              </label>
              <input className="input w-24" id="order" name="order" type="number" defaultValue={skill.order} min={1} />
            </div>
          </div>

          <TheoryCardsBuilder initial={skill.theoryCards} />

          <button className="btn-primary" type="submit">
            Сохранить навык
          </button>
        </form>

        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-black text-ink">
            Банк задач <span className="text-ink-soft">({problems.length})</span>
          </h2>
          <a href={`/teacher/content/skill/${skill.id}/problem/new`} className="btn-primary !text-xs">
            + Задача
          </a>
        </div>

        <div className="space-y-2">
          {problems.map((p, i) => {
            const hasAttempts = attemptCounts[i] > 0;
            return (
              <div key={p.id} className="card flex items-start justify-between gap-3 p-3.5 text-sm">
                <a href={`/teacher/content/skill/${skill.id}/problem/${p.id}/edit`} className="min-w-0 flex-1">
                  <p className="text-ink">{p.text}</p>
                  <p className="mt-0.5 flex flex-wrap gap-1.5 text-[11px] text-ink-soft">
                    <span>{p.answerType === "DETAILED" ? "развёрнутый ответ" : `ответ: ${p.correctAnswer}`}</span>
                    <span>· {(p.tier ?? "core") === "core" ? "в уроке" : "только в банке"}</span>
                    {p.egeTaskNumber && <span>· ЕГЭ №{p.egeTaskNumber}</span>}
                    {hasAttempts && <span className="text-amber">· уже решали ученики</span>}
                  </p>
                </a>
                <form action={deleteProblemAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="skillId" value={skill.id} />
                  <button
                    type="submit"
                    title={hasAttempts ? "Нельзя удалить — есть попытки учеников" : "Удалить задачу"}
                    className="shrink-0 text-xs font-bold text-coral hover:underline disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    Удалить
                  </button>
                </form>
              </div>
            );
          })}
          {problems.length === 0 && (
            <p className="text-sm text-ink-soft">В этом навыке пока нет задач.</p>
          )}
        </div>
      </main>
    </div>
  );
}
