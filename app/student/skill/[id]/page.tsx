import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import {
  getSkill,
  getChapter,
  getProblemsForSkill,
  getAllSkillsFlat,
  computeStudentProgress,
  getPathStates,
  getNextSkill,
  computeProblemStates,
  toPublicProblem,
  isStandaloneStudent,
  isEffectivelyPro,
} from "@/lib/queries";
import AppHeader from "@/components/AppHeader";
import LessonFlow from "@/components/LessonFlow";

export default async function SkillPage({ params }: { params: { id: string } }) {
  const user = (await getSessionUser())!;
  const skill = await getSkill(params.id);
  if (!skill) notFound();
  const chapter = await getChapter(skill.subtopicId);

  // Free-план самостоятельных пользователей видит только первую главу — та
  // же граница, что на дашборде, но проверенная и здесь (иначе достаточно
  // знать прямую ссылку на навык, чтобы обойти ограничение).
  const isFreeStandalone = isStandaloneStudent(user) && !isEffectivelyPro(user);
  if (isFreeStandalone && chapter && chapter.order !== 1) {
    redirect("/student/upgrade");
  }

  const allSkills = await getAllSkillsFlat();
  const progress = await computeStudentProgress(user.id);
  const pathStates = getPathStates(allSkills, progress);
  if (pathStates[skill.id] === "locked") {
    redirect("/student");
  }

  // DETAILED (развёрнутые) задачи — для самостоятельных на Free их прячем:
  // без учителя и без Pro-самопроверки они были бы недоступны/бессмысленны.
  let problems = await getProblemsForSkill(skill.id);
  if (isFreeStandalone) {
    problems = problems.filter((p) => p.answerType !== "DETAILED");
  }
  const states = await computeProblemStates(user.id, problems);
  const next = getNextSkill(allSkills, skill.id);

  return (
    <div className="min-h-screen pb-16">
      <AppHeader
        user={user}
        crumbs={[
          { label: "Путь обучения", href: "/student" },
          { label: chapter?.title ?? "", href: "/student" },
          { label: skill.title },
        ]}
      />
      <main className="mx-auto max-w-2xl px-4">
        <h1 className="mb-5 font-display text-2xl font-black text-ink">{skill.title}</h1>

        <LessonFlow
          skillTitle={skill.title}
          theoryCards={skill.theoryCards}
          problems={problems.map(toPublicProblem)}
          initialStates={states}
          nextHref={next ? `/student/skill/${next.id}` : "/student"}
          nextLabel={next ? `Дальше: ${next.title}` : "К пути обучения"}
          isLastSkill={!next}
        />
      </main>
    </div>
  );
}
