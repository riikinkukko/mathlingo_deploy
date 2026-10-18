import { requireContentEditor } from "@/lib/content-guard";
import { getCurriculum, getProblemsForSkill } from "@/lib/queries";
import TeacherShell from "@/components/TeacherShell";
import { createChapterAction, updateChapterAction, createTopicAction, updateTopicAction } from "@/app/actions-content";
import { IconClipboard } from "@/components/icons";

export default async function ContentOverviewPage(
  props: {
    searchParams: Promise<{ error?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const teacher = await requireContentEditor();
  const curriculum = await getCurriculum({ includeEmpty: true });
  const allSkills = curriculum.flatMap((t) => t.chapters).flatMap((c) => c.skills);
  const countPairs = await Promise.all(
    allSkills.map(async (s) => [s.id, (await getProblemsForSkill(s.id, true)).length] as const)
  );
  const countBySkill = new Map(countPairs);

  return (
    <TeacherShell active="content" title="Контент программы">
      <main className="mx-auto max-w-3xl px-4 pt-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-black text-ink">Контент программы</h1>
            <p className="mt-1 text-sm text-ink-soft">
              Темы, навыки и задачи общего курса. Изменения сразу видят все ученики платформы.
            </p>
          </div>
        </div>

        {searchParams.error && (
          <div className="mb-4 rounded-2xl border-2 border-coral-light bg-coral-light p-3.5 text-sm font-bold text-coral">
            Не удалось сохранить — проверьте, что все обязательные поля заполнены.
          </div>
        )}

        {curriculum.map(({ topic, chapters }) => (
          <section key={topic.id} id={topic.id} className="mb-8 scroll-mt-20">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs font-extrabold uppercase tracking-widest text-ink-soft">{topic.title}</p>
              <details className="relative">
                <summary className="cursor-pointer list-none text-xs font-bold text-ink-soft hover:text-pine">Изменить тему</summary>
                <form action={updateTopicAction} className="absolute right-0 z-10 mt-2 grid w-72 gap-2 rounded-2xl border border-line-soft bg-white p-3 shadow-soft">
                  <input type="hidden" name="id" value={topic.id} />
                  <label className="label" htmlFor={`tt-${topic.id}`}>Название темы</label>
                  <input className="input" id={`tt-${topic.id}`} name="title" defaultValue={topic.title} required />
                  <label className="label" htmlFor={`to-${topic.id}`}>Порядок в списке предметов</label>
                  <input className="input" id={`to-${topic.id}`} name="order" type="number" min={1} defaultValue={topic.order} />
                  <button className="btn-primary !h-10" type="submit">Сохранить</button>
                </form>
              </details>
            </div>
            {chapters.length === 0 && (
              <p className="mb-3 text-xs text-ink-soft">В теме пока нет глав — ученики её не увидят, пока не появится хотя бы один навык.</p>
            )}

            {chapters.map(({ chapter, skills }) => (
              <div key={chapter.id} className="mb-5">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h2 className="min-w-0 font-display text-base font-black text-ink">{chapter.title}</h2>
                  <div className="flex shrink-0 items-center gap-3">
                    <details className="relative">
                      <summary className="cursor-pointer list-none text-xs font-bold text-ink-soft hover:text-pine">Изменить</summary>
                      <form action={updateChapterAction} className="absolute right-0 z-10 mt-2 grid w-72 gap-2 rounded-2xl border border-line-soft bg-white p-3 shadow-soft">
                        <input type="hidden" name="id" value={chapter.id} />
                        <label className="label" htmlFor={`ct-${chapter.id}`}>Название главы</label>
                        <input className="input" id={`ct-${chapter.id}`} name="title" defaultValue={chapter.title} required />
                        <label className="label" htmlFor={`co-${chapter.id}`}>Порядок в теме</label>
                        <input className="input" id={`co-${chapter.id}`} name="order" type="number" min={1} defaultValue={chapter.order} />
                        <label className="label" htmlFor={`cp-${chapter.id}`}>Тема</label>
                        <select className="input" id={`cp-${chapter.id}`} name="topicId" defaultValue={topic.id}>
                          {curriculum.map(({ topic: t }) => (
                            <option key={t.id} value={t.id}>{t.title}</option>
                          ))}
                        </select>
                        <button className="btn-primary !h-10" type="submit">Сохранить</button>
                      </form>
                    </details>
                    <a
                      href={`/teacher/content/skill/new?subtopicId=${chapter.id}`}
                      className="text-xs font-bold text-pine hover:underline"
                    >
                      + Навык
                    </a>
                  </div>
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

            <details className="rounded-2xl border border-dashed border-line p-3">
              <summary className="cursor-pointer text-sm font-bold text-ink-soft">+ Глава в теме «{topic.title}»</summary>
              <form action={createChapterAction} className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                <input type="hidden" name="topicId" value={topic.id} />
                <div>
                  <label className="label" htmlFor={`nc-${topic.id}`}>Название главы</label>
                  <input className="input" id={`nc-${topic.id}`} name="title" required placeholder="Например: Метод интервалов" />
                </div>
                <div>
                  <label className="label" htmlFor={`nco-${topic.id}`}>Порядок</label>
                  <input className="input w-24" id={`nco-${topic.id}`} name="order" type="number" defaultValue={chapters.length + 1} min={1} />
                </div>
                <button className="btn-primary self-end" type="submit">Создать</button>
              </form>
            </details>
          </section>
        ))}

        <details className="card p-4">
          <summary className="cursor-pointer text-sm font-bold text-ink">+ Добавить тему</summary>
          <p className="mt-2 text-[12px] text-ink-soft">
            Тема — отдельный предмет в списке «Предметы» (например, «Теория чисел»). Ученики увидят её, когда в ней появится хотя бы один навык.
          </p>
          <form action={createTopicAction} className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <div>
              <label className="label" htmlFor="topic-title">Название темы</label>
              <input className="input" id="topic-title" name="title" required placeholder="Например: Теория чисел" />
            </div>
            <div>
              <label className="label" htmlFor="topic-order">Порядок</label>
              <input
                className="input w-24"
                id="topic-order"
                name="order"
                type="number"
                min={1}
                defaultValue={Math.max(0, ...curriculum.map((t) => t.topic.order)) + 1}
              />
            </div>
            <button className="btn-primary self-end" type="submit">Создать</button>
          </form>
        </details>
      </main>
    </TeacherShell>
  );
}
