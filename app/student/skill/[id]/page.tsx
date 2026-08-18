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
  isSkillAccessibleOnFree,
} from "@/lib/queries";
import LessonFlow from "@/components/LessonFlow";

export default async function SkillPage({ params }: { params: { id: string } }) {
  const user = (await getSessionUser())!;
  const skill = await getSkill(params.id);
  if (!skill) notFound();
  const chapter = await getChapter(skill.subtopicId);
  const allSkills = await getAllSkillsFlat();

  // Free-план самостоятельных пользователей: вся первая глава + первый
  // навык любой другой — та же граница, что на дашборде и на странице
  // программы, но проверенная и здесь (иначе достаточно прямой ссылки на
  // навык, чтобы обойти ограничение).
  const isFreeStandalone = isStandaloneStudent(user) && !isEffectivelyPro(user);
  if (isFreeStandalone && chapter) {
    const siblingSkills = allSkills.filter((s) => s.subtopicId === skill.subtopicId);
    if (!isSkillAccessibleOnFree(skill, chapter.order, siblingSkills)) {
      redirect("/student/upgrade");
    }
  }

  const progress = await computeStudentProgress(user.id);
  const pathStates = getPathStates(allSkills, progress);
  const siblingSkillsForTrial = allSkills.filter((s) => s.subtopicId === skill.subtopicId);
  const isFreeTrialSkill =
    isFreeStandalone && chapter && chapter.order !== 1 && isSkillAccessibleOnFree(skill, chapter.order, siblingSkillsForTrial);
  // "Попробовать 1 навык" из следующей главы должен быть доступен сразу, а
  // не только после того, как ученик пройдёт ВСЮ первую главу — иначе проба
  // была бы недостижима до покупки, что бессмысленно как приём воронки.
  if (!isFreeTrialSkill && pathStates[skill.id] === "locked") {
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
    <div className="min-h-screen bg-paper px-4 py-4 pb-16">
      <LessonFlow
        skillTitle={skill.title}
        theoryCards={skill.theoryCards}
        problems={problems.map(toPublicProblem)}
        initialStates={states}
        nextHref={next ? `/student/skill/${next.id}` : "/student"}
        nextLabel={next ? `Дальше: ${next.title}` : "К пути обучения"}
        isLastSkill={!next}
      />
    </div>
  );
}
