import { getSessionUser } from "@/lib/auth";
import { getCurriculum, getProblemsForSkill } from "@/lib/queries";
import AppHeader from "@/components/AppHeader";
import { createChapterAction } from "@/app/actions-content";
import { IconClipboard } from "@/components/icons";

export default async function ContentOverviewPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const teacher = (await getSessionUser())!;
  const curriculum = await getCurriculum();
  const allSkills = curriculum.flatMap((t) => t.chapters).flatMap((c) => c.skills);
  const countPairs = await Promise.all(
    allSkills.map(async (s) => [s.id, (await getProblemsForSkill(s.id, true)).length] as const)
  );
  const countBySkill = new Map(countPairs);

  return (
    <div className="min-h-screen pb-16">
      <AppHeader user={teacher} crumbs={[{ label: "Мои ученики", href: "/teacher" }, { label: "Контент программы" }]} />
      <main className="mx-auto max-w-3xl px-4">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-black text-ink">Контент программы</h1>
            <p className="mt-1 text-sm text-ink-soft">
              Редактируйте темы/навыки/задачи прямо здесь — правка в{" "}
              <code className="rounded bg-grid px-1 py-0.5 text-xs">scripts/seed.ts</code> больше не
              обязательна.
            </p>
          </div>
        </div>

        {searchParams.error && (
          <div className="mb-4 rounded-2xl border-2 border-coral-light bg-coral-light p-3.5 text-sm font-bold text-coral">
            Не удалось сохранить — проверьте, что все обязательные поля заполнены.
          </div>
        )}

        {curriculum.map(({ topic, chapters }) => (
          <div key={topic.id} className="mb-8">
            <p className="mb-3 text-xs font-extrabold uppercase tracking-widest text-ink-soft">
              {topic.title}
            </p>

            {chapters.map(({ chapter, skills }) => (
              <div key={chapter.id} className="mb-5">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="font-display text-base font-black text-ink">{chapter.title}</h2>
                  <a
                    href={`/teacher/content/skill/new?subtopicId=${chapter.id}`}
                    className="text-xs font-bold text-pine hover:underline"
                  >
                    + Навык
                  </a>
                </div>
                <div className="space-y-2">
                  {skills.map((s) => (
                    <a
                      key={s.id}
                      href={`/teacher/content/skill/${s.id}`}
                      className="card flex items-center justify-between gap-3 p-3.5 text-sm transition hover:border-pine"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink">{s.title}</p>
                        <p className="text-[11px] text-ink-soft">
                          {s.theoryCards.length} карточек теории · {countBySkill.get(s.id) ?? 0} задач в банке
                        </p>
                      </div>
                      <span className="shrink-0 text-ink-soft">→</span>
                    </a>
                  ))}
                  {skills.length === 0 && (
                    <p className="text-xs text-ink-soft">В этой главе пока нет навыков.</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}

        <details className="card p-4">
          <summary className="cursor-pointer text-sm font-bold text-ink">+ Добавить главу</summary>
          <form action={createChapterAction} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <div>
              <label className="label" htmlFor="chapter-title">
                Название главы
              </label>
              <input className="input" id="chapter-title" name="title" required placeholder="Например: Стереометрия" />
            </div>
            <div>
              <label className="label" htmlFor="chapter-order">
                Порядок
              </label>
              <input className="input w-24" id="chapter-order" name="order" type="number" defaultValue={6} min={1} />
            </div>
            <button className="btn-primary self-end" type="submit">
              Создать
            </button>
          </form>
        </details>
      </main>
    </div>
  );
}
