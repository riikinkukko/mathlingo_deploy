import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getSkill, getChapter, getProblem } from "@/lib/queries";
import AppHeader from "@/components/AppHeader";
import ProblemForm from "@/components/ProblemForm";
import { updateProblemAction } from "@/app/actions-content";

export default async function EditProblemPage({
  params,
}: {
  params: { id: string; problemId: string };
}) {
  const teacher = (await getSessionUser())!;
  const skill = await getSkill(params.id);
  const problem = await getProblem(params.problemId);
  if (!skill || !problem) notFound();
  const chapter = await getChapter(skill.subtopicId);

  return (
    <div className="min-h-screen pb-16">
      <AppHeader
        user={teacher}
        crumbs={[
          { label: "Мои ученики", href: "/teacher" },
          { label: "Контент программы", href: "/teacher/content" },
          { label: skill.title, href: `/teacher/content/skill/${skill.id}` },
          { label: "Редактирование задачи" },
        ]}
      />
      <main className="mx-auto max-w-2xl px-4">
        <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-ink-soft">
          {chapter?.title ?? "—"} · {skill.title}
        </p>
        <h1 className="mb-6 font-display text-2xl font-black text-ink">Редактирование задачи</h1>
        <ProblemForm action={updateProblemAction} skillId={skill.id} problem={problem} />
      </main>
    </div>
  );
}
