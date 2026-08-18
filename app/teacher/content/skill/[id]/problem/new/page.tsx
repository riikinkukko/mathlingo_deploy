import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getSkill, getChapter } from "@/lib/queries";
import TeacherShell from "@/components/TeacherShell";
import ProblemForm from "@/components/ProblemForm";
import { createProblemAction } from "@/app/actions-content";

export default async function NewProblemPage({ params }: { params: { id: string } }) {
  const teacher = (await getSessionUser())!;
  const skill = await getSkill(params.id);
  if (!skill) notFound();
  const chapter = await getChapter(skill.subtopicId);

  return (
    <TeacherShell active="content" title="Новая задача">
      <main className="mx-auto max-w-2xl px-4 pt-6">
        <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-ink-soft">
          {chapter?.title ?? "—"} · {skill.title}
        </p>
        <h1 className="mb-6 font-display text-2xl font-black text-ink">Новая задача</h1>
        <ProblemForm action={createProblemAction} skillId={skill.id} />
      </main>
    </TeacherShell>
  );
}
