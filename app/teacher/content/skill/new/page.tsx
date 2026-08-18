import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getChapter } from "@/lib/queries";
import TeacherShell from "@/components/TeacherShell";
import TheoryCardsBuilder from "@/components/TheoryCardsBuilder";
import { createSkillAction } from "@/app/actions-content";

export default async function NewSkillPage({
  searchParams,
}: {
  searchParams: { subtopicId?: string };
}) {
  const teacher = (await getSessionUser())!;
  const subtopicId = searchParams.subtopicId;
  const chapter = subtopicId ? await getChapter(subtopicId) : undefined;
  if (!subtopicId || !chapter) notFound();

  return (
    <TeacherShell active="content" title="Новый навык">
      <main className="mx-auto max-w-2xl px-4 pt-6">
        <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-ink-soft">{chapter.title}</p>
        <h1 className="mb-6 font-display text-2xl font-black text-ink">Новый навык</h1>

        <form action={createSkillAction} className="space-y-4">
          <input type="hidden" name="subtopicId" value={subtopicId} />
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div>
              <label className="label" htmlFor="title">
                Название навыка
              </label>
              <input className="input" id="title" name="title" required placeholder="Например: Теорема синусов" />
            </div>
            <div>
              <label className="label" htmlFor="order">
                Порядок в главе
              </label>
              <input className="input w-24" id="order" name="order" type="number" defaultValue={1} min={1} />
            </div>
          </div>

          <TheoryCardsBuilder initial={[]} />

          <button className="btn-primary" type="submit">
            Создать навык
          </button>
        </form>
      </main>
    </TeacherShell>
  );
}
