/**
 * Данные урока (навыка) для ученика — общая логика страницы
 * app/student/skill/[id] и мобильного API (/api/m/skill/[id]). Здесь же все
 * правила доступа: Free-граница, блокировка следующих навыков, витрина
 * развёрнутой задачи для Free, обязательная теория при первом знакомстве с темой.
 */
import {
  computeProblemStates,
  computeStudentProgress,
  getChapter,
  getCurriculum,
  getNextSkill,
  getPathStates,
  getProblemsForSkill,
  getSkill,
  isEffectivelyPro,
  isSkillAccessibleOnFree,
  isStandaloneStudent,
  type ProblemState,
} from "./queries";
import type { Problem, Skill, User } from "./types";

export type LessonData =
  | { status: "notfound" }
  | { status: "upgrade" }
  | { status: "locked"; topicId: string | null }
  | {
      status: "ok";
      skill: Skill;
      topicId: string | null;
      problems: Problem[];
      states: Record<string, ProblemState>;
      next: Skill | null;
      forceTheoryFirst: boolean;
      detailedPreview: { text: string; solution: string; egeTaskNumber: number | null } | null;
    };

export async function getLessonData(user: User, skillId: string): Promise<LessonData> {
  const skill = await getSkill(skillId);
  if (!skill) return { status: "notfound" };

  const [chapter, curriculum, progress, problemsRaw] = await Promise.all([
    getChapter(skill.subtopicId),
    getCurriculum(),
    computeStudentProgress(user.id),
    getProblemsForSkill(skill.id),
  ]);

  // Прогресс и блокировка — только в рамках своей темы: иначе первый навык
  // второй темы наследовал бы «заблокированность» от непройденной первой.
  const topicEntry = chapter
    ? curriculum.find((t) => t.chapters.some((c) => c.chapter.id === chapter.id))
    : curriculum[0];
  const topicId = topicEntry?.topic.id ?? null;
  const allSkills = (topicEntry ?? curriculum[0])?.chapters.flatMap((c) => c.skills) ?? [];

  // Free: вся первая глава + первый навык любой другой — проверяем и здесь,
  // иначе прямая ссылка на навык обходила бы ограничение.
  const isFreeStandalone = isStandaloneStudent(user) && !isEffectivelyPro(user);
  const siblingSkills = allSkills.filter((s) => s.subtopicId === skill.subtopicId);
  if (isFreeStandalone && chapter && !isSkillAccessibleOnFree(skill, chapter.order, siblingSkills)) {
    return { status: "upgrade" };
  }

  const pathStates = getPathStates(allSkills, progress);
  // «Попробовать 1 навык» следующей главы доступен сразу, не только после всей первой.
  const isFreeTrialSkill =
    isFreeStandalone && !!chapter && chapter.order !== 1 && isSkillAccessibleOnFree(skill, chapter.order, siblingSkills);
  if (!isFreeTrialSkill && pathStates[skill.id] === "locked") return { status: "locked", topicId };

  // Развёрнутые задачи на Free прячем, но одну показываем витриной — условие
  // и эталон после урока, чтобы было видно, что откроет Pro.
  let problems = problemsRaw;
  let detailedPreview: { text: string; solution: string; egeTaskNumber: number | null } | null = null;
  if (isFreeStandalone) {
    const sample = problems.find((p) => p.answerType === "DETAILED");
    if (sample) detailedPreview = { text: sample.text, solution: sample.correctAnswer, egeTaskNumber: sample.egeTaskNumber ?? null };
    problems = problems.filter((p) => p.answerType !== "DETAILED");
  }
  const states = await computeProblemStates(user.id, problems);
  const next = getNextSkill(allSkills, skill.id);

  // Теория обязательна, только если в этой теме ещё не решено ни одной задачи.
  const forceTheoryFirst = !allSkills.some((s) => (progress[s.id]?.solved ?? 0) > 0);

  return { status: "ok", skill, topicId, problems, states, next, forceTheoryFirst, detailedPreview };
}
