import { getSessionUser } from "@/lib/auth";
import {
  getCurriculum,
  computeStudentProgress,
  computeXp,
  computeStreak,
  getPathStates,
  getProblemsForSkill,
  getHomeworksForStudent,
  homeworkStatus,
  isStandaloneStudent,
  getEffectiveEnergy,
  getDueReviewCount,
  getLevelInfo,
  LEVELS,
} from "@/lib/queries";
import { pluralRu } from "@/lib/pluralize";
import AppHeader from "@/components/AppHeader";
import Mascot from "@/components/Mascot";
import SkillPath from "@/components/SkillPath";
import { IconMap, IconClipboard, IconCrown } from "@/components/icons";

export default async function StudentDashboard() {
  const user = (await getSessionUser())!;
  const curriculum = await getCurriculum();
  const progress = await computeStudentProgress(user.id);
  const xp = await computeXp(user.id);
  const level = getLevelInfo(xp);
  const streak = await computeStreak(user.id);
  const allHw = await getHomeworksForStudent(user.id);
  const hwStatuses = await Promise.all(allHw.map((h) => homeworkStatus(h, user.id)));
  const pendingHw = allHw.filter((_, i) => !hwStatuses[i].complete);
  const dueReviewCount = await getDueReviewCount(user.id);

  // Free-план самостоятельных пользователей видит только первую главу —
  // остальные показаны, но заблокированы отдельной причиной (не "пройдите
  // предыдущую тему", а "нужен Pro").
  const standalone = isStandaloneStudent(user);
  const isFreeStandalone = standalone && user.plan !== "pro";
  const energy = standalone ? Math.floor(getEffectiveEnergy(user)) : Infinity;

  const allSkills = curriculum.flatMap((t) => t.chapters.flatMap((c) => c.skills));
  const pathStates = getPathStates(allSkills, progress);
  const doneCount = allSkills.filter((s) => pathStates[s.id] === "done").length;
  const modulePct = allSkills.length ? Math.round((doneCount / allSkills.length) * 100) : 0;

  // Число задач на навык — считаем один раз заранее (нельзя await внутри JSX .map).
  const problemCountPairs = await Promise.all(
    allSkills.map(async (s) => [s.id, (await getProblemsForSkill(s.id)).length] as const)
  );
  const problemCountBySkill = new Map(problemCountPairs);

  const mascotMood =
    energy === 0
      ? "worried"
      : doneCount === allSkills.length && allSkills.length > 0
        ? "celebrating"
        : doneCount > 0
          ? "happy"
          : "idle";

  return (
    <div className="min-h-screen pb-16">
      <AppHeader
        user={user}
        gamification={{ xp, streak }}
        subTabs={[
          { label: "Путь обучения", href: "/student", active: true, icon: <IconMap className="h-4 w-4" /> },
          { label: standalone ? "Пробники" : "Домашнее задание", href: "/student/homework", active: false, icon: <IconClipboard className="h-4 w-4" /> },
        ]}
      />

      <main className="mx-auto max-w-3xl px-4 pt-6">
        <div className="mb-5 flex items-center gap-4 rounded-card bg-white p-4 shadow-soft">
          <Mascot mood={mascotMood} size={76} interactive />
          <p className="text-sm font-bold text-ink-soft">
            {energy === 0
              ? "У Гео закончилась энергия для новых задач — но старые можно повторять!"
              : doneCount > 0
                ? "Гео гордится твоим прогрессом!"
                : "Гео — твой спутник по планиметрии. Погнали?"}
          </p>
        </div>

        <div className="mb-5 rounded-card bg-white p-4 shadow-soft">
          <div className="flex items-center justify-between">
            <p className="font-display text-base font-black text-ink">
              {level.title}
            </p>
            <p className="text-xs font-bold text-ink-soft">
              {level.nextLevelMinXp !== null
                ? `${level.xp} / ${level.nextLevelMinXp} XP`
                : `${level.xp} XP · максимум`}
            </p>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-pill bg-grid">
            <div
              className="h-full origin-left animate-grow-x rounded-pill bg-gradient-to-r from-teal to-pine transition-all"
              style={{ width: `${level.progressPct}%` }}
            />
          </div>
          {level.nextLevelMinXp !== null && (
            <p className="mt-1.5 text-[11px] text-ink-soft">
              Ещё {level.nextLevelMinXp - level.xp} XP до звания «{LEVELS[level.index + 1].title}»
            </p>
          )}
        </div>

        {isFreeStandalone && energy === 0 && (
          <a
            href="/student/upgrade"
            className="mb-5 flex items-center justify-between rounded-2xl border-2 border-teal/30 bg-teal-light px-4 py-3 text-sm font-bold text-teal transition hover:brightness-95"
          >
            <span>⚡ Энергия закончилась — восстановится со временем, или открой Pro прямо сейчас</span>
            <span>→</span>
          </a>
        )}

        {dueReviewCount > 0 && (
          <a
            href="/student/review"
            className="mb-5 flex items-center justify-between rounded-2xl border-2 border-violet/30 bg-violet-light px-4 py-3 text-sm font-bold text-violet transition hover:brightness-95"
          >
            <span className="flex items-center gap-2">
              🧠 {dueReviewCount} {pluralRu(dueReviewCount, ["задача готова", "задачи готовы", "задач готовы"])} к повторению
            </span>
            <span>→</span>
          </a>
        )}

        {pendingHw.length > 0 && (
          <a
            href="/student/homework"
            className="mb-5 flex items-center justify-between rounded-2xl border-2 border-amber/30 bg-amber-light px-4 py-3 text-sm font-bold text-amber transition hover:brightness-95"
          >
            <span className="flex items-center gap-2">
              <IconClipboard className="h-4 w-4" />
              У вас {pendingHw.length}{" "}
              {pendingHw.length === 1 ? "невыполненное" : "невыполненных"}{" "}
              {pluralRu(pendingHw.length, ["задание", "задания", "заданий"])}
            </span>
            <span>→</span>
          </a>
        )}

        {curriculum.map(({ topic, chapters }) => (
          <div key={topic.id} className="mb-8">
            <div className="relative overflow-hidden rounded-card bg-gradient-to-br from-pine to-pine-dark p-6 text-white shadow-soft">
              <p className="text-xs font-extrabold uppercase tracking-widest text-white/70">Модуль</p>
              <h1 className="mt-1 font-display text-2xl font-black">{topic.title}</h1>
              <div className="mt-5 flex items-center justify-between text-xs font-bold text-white/80">
                <span>Прогресс модуля</span>
                <span>{doneCount}/{allSkills.length} навыков</span>
              </div>
              <div className="mt-2 h-3 w-full overflow-hidden rounded-pill bg-white/20">
                <div
                  className="h-full origin-left animate-grow-x rounded-pill bg-amber transition-all"
                  style={{ width: `${modulePct}%` }}
                />
              </div>
            </div>

            {chapters.map(({ chapter, skills }, chapterIdx) => {
              const chapterDone = skills.filter((s) => pathStates[s.id] === "done").length;
              const chapterLockedByPlan = isFreeStandalone && chapterIdx > 0;

              return (
                <div key={chapter.id} className="mt-8">
                  <div className="mb-4 flex items-center justify-between px-2">
                    <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-ink-soft">
                      {chapter.title}
                      {chapterLockedByPlan && <IconCrown className="h-3.5 w-3.5 text-amber" />}
                    </p>
                    <p className="text-xs font-bold text-ink-soft">
                      {chapterDone}/{skills.length}
                    </p>
                  </div>

                  {chapterLockedByPlan ? (
                    <a
                      href="/student/upgrade"
                      className="card mx-2 flex items-center gap-4 p-4 opacity-90 transition hover:-translate-y-0.5 hover:shadow-lg"
                    >
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber to-coral text-white">
                        <IconCrown className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-base font-black text-ink">Открыть в Pro</p>
                        <p className="mt-0.5 text-xs text-ink-soft">
                          Вся глава «{chapter.title}» доступна на Pro-плане
                        </p>
                      </div>
                    </a>
                  ) : (
                    <SkillPath
                      colorIndex={chapterIdx}
                      skills={skills.map((s) => ({
                        id: s.id,
                        title: s.title,
                        state: pathStates[s.id],
                        problemsCount: problemCountBySkill.get(s.id) ?? 0,
                        factsCount: s.theoryCards.length,
                        solvedCount: progress[s.id]?.solved ?? 0,
                      }))}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </main>
    </div>
  );
}
