import {
  computeDailyGoal,
  computeStreak,
  computeStudentProgress,
  computeXp,
  FREE_MAX_ENERGY,
  gateCurriculumForUser,
  getCurriculum,
  getDueReviewCount,
  getEffectiveEnergy,
  getHomeworksForStudent,
  getLevelInfo,
  getMistakesForStudent,
  getPathStates,
  getUserById,
  homeworkStatus,
  isStandaloneStudent,
} from "@/lib/queries";
import { topicIcon } from "@/lib/topic-icons";
import { EXAM_DATE } from "@/lib/exam-plan";
import { getActiveMock } from "@/lib/mock-queries";
import { json, requireStudent } from "@/lib/mobile/api";
import { userSummary } from "@/lib/mobile/session";

export const dynamic = "force-dynamic";

/**
 * Главный экран приложения: профиль и счётчики, список тем с прогрессом и
 * путь выбранной темы (?topic=, по умолчанию — первая тема с незаконченными
 * навыками). Блокировка навыков считается внутри каждой темы отдельно, как
 * на сайте.
 */
export async function GET(req: Request) {
  const user = await requireStudent(req);
  if (user instanceof Response) return user;
  const topicParam = new URL(req.url).searchParams.get("topic");

  const [curriculumRaw, progress, xp, streak, dailyGoal, dueReview, mistakes, homeworks, activeMock, teacher] =
    await Promise.all([
      getCurriculum(),
      computeStudentProgress(user.id),
      computeXp(user.id),
      computeStreak(user.id),
      computeDailyGoal(user.id),
      getDueReviewCount(user.id),
      getMistakesForStudent(user.id),
      getHomeworksForStudent(user.id),
      getActiveMock(user.id),
      user.teacherId ? getUserById(user.teacherId) : Promise.resolve(undefined),
    ]);
  const curriculum = gateCurriculumForUser(user, curriculumRaw);
  const hwStatuses = await Promise.all(homeworks.map((h) => homeworkStatus(h, user.id)));

  const topics = curriculum.map((t) => {
    const skills = t.chapters.flatMap((c) => c.skills);
    const states = getPathStates(skills, progress);
    return {
      id: t.topic.id,
      title: t.topic.title,
      icon: topicIcon(t.topic.title),
      done: skills.filter((s) => states[s.id] === "done").length,
      total: skills.length,
    };
  });
  const selected =
    curriculum.find((t) => t.topic.id === topicParam) ??
    curriculum.find((t, i) => topics[i].done < topics[i].total) ??
    curriculum[0];

  const selectedSkills = selected ? selected.chapters.flatMap((c) => c.skills) : [];
  const pathStates = getPathStates(selectedSkills, progress);
  const level = getLevelInfo(xp);
  const standalone = isStandaloneStudent(user);
  const energyLimited = standalone && Number.isFinite(getEffectiveEnergy(user));
  const daysLeft = Math.max(0, Math.ceil((new Date(`${EXAM_DATE}T09:00:00+03:00`).getTime() - Date.now()) / 86_400_000));

  return json({
    user: { ...userSummary(user), teacherName: teacher?.name ?? null },
    stats: {
      xp,
      level: { title: level.title, progressPct: level.progressPct },
      streak,
      dailyGoal,
      // null — энергия не ограничена (Pro и ученики репетитора).
      energy: energyLimited ? Math.floor(getEffectiveEnergy(user)) : null,
      energyMax: energyLimited ? FREE_MAX_ENERGY : null,
      examDaysLeft: daysLeft,
    },
    counts: {
      dueReview,
      mistakes: mistakes.filter((m) => !m.resolved).length,
      // Только задания репетитора (не общие авторские пробники платформы).
      homework: homeworks.filter((h, i) => h.studentId === user.id && !hwStatuses[i].complete).length,
    },
    topics,
    topic: selected
      ? {
          id: selected.topic.id,
          title: selected.topic.title,
          icon: topicIcon(selected.topic.title),
          chapters: selected.chapters.map((c) => ({
            id: c.chapter.id,
            title: c.chapter.title,
            skills: c.skills.map((s) => ({
              id: s.id,
              title: s.title,
              state: pathStates[s.id] ?? "locked",
              solved: progress[s.id]?.solved ?? 0,
              total: progress[s.id]?.total ?? 0,
              // Free: навык за пределами бесплатной части (gateCurriculumForUser).
              proOnly: "locked" in s && (s as { locked?: boolean }).locked === true,
            })),
          })),
        }
      : null,
    activeMock: activeMock
      ? {
          id: activeMock.id,
          variant: activeMock.variant,
          answered: Object.keys(activeMock.answers).length,
          total: activeMock.items.length,
          deadlineAt: activeMock.deadlineAt ? new Date(activeMock.deadlineAt).toISOString() : null,
        }
      : null,
  });
}
