import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import {
  getSkill,
  getChapter,
  getProblemsForSkill,
  getCurriculum,
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

  // Все четыре запроса ниже зависят только от skill.id/user.id, уже
  // известных — независимы друг от друга, распараллеливаем вместо
  // последовательного await (главная причина "долгой загрузки" — водопад
  // из нескольких круговых задержек до сети Neon подряд).
  const [chapter, curriculum, progress, problemsRaw] = await Promise.all([
    getChapter(skill.subtopicId),
    getCurriculum(),
    computeStudentProgress(user.id),
    getProblemsForSkill(skill.id),
  ]);

  // Прогресс/блокировка навыка считается ТОЛЬКО в рамках его собственной
  // темы (Планиметрия, Теория вероятности и т.д.) — раньше здесь брался
  // общий плоский список навыков по ВСЕМ темам разом, и первый навык
  // второй темы наследовал "заблокированность" от непройденной первой
  // (getPathStates трактует любой переданный список как одну непрерывную
  // цепочку). Берём только навыки той темы, куда входит открываемая глава.
  const topicEntry = chapter
    ? curriculum.find((t) => t.chapters.some((c) => c.chapter.id === chapter.id))
    : curriculum[0];
  const allSkills = (topicEntry ?? curriculum[0])?.chapters.flatMap((c) => c.skills) ?? [];

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
  let problems = problemsRaw;
  if (isFreeStandalone) {
    problems = problems.filter((p) => p.answerType !== "DETAILED");
  }
  const states = await computeProblemStates(user.id, problems);
  const next = getNextSkill(allSkills, skill.id);

  // Обязательный первый показ теории — только если ученик ещё НИ РАЗУ не
  // решал задачи во всей ЭТОЙ теме (не навыке — теме целиком). Первое
  // знакомство с совсем новым предметом (например, теория вероятности
  // после привычной планиметрии) без единой подсказки контекста — слишком
  // резко. А внутри уже знакомой темы прыгать сразу к задачам, как раньше,
  // по-прежнему правильно — контекст уже есть.
  const hasAnyProgressInTopic = allSkills.some((s) => (progress[s.id]?.solved ?? 0) > 0);
  const forceTheoryFirst = !hasAnyProgressInTopic;

  return (
    <div className="min-h-screen bg-paper px-4 pb-16 pt-[max(1rem,env(safe-area-inset-top))]">
      <LessonFlow
        skillTitle={skill.title}
        theoryCards={skill.theoryCards}
        problems={problems.map(toPublicProblem)}
        initialStates={states}
        nextHref={next ? `/student/skill/${next.id}` : `/student?topic=${topicEntry?.topic.id ?? ""}`}
        nextLabel={next ? `Дальше: ${next.title}` : "К пути обучения"}
        isLastSkill={!next}
        forceTheoryFirst={forceTheoryFirst}
        backHref={`/student?topic=${topicEntry?.topic.id ?? ""}`}
      />
    </div>
  );
}
