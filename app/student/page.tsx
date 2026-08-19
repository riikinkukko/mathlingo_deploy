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
  isEffectivelyPro,
  computeDailyGoal,
  computeWeekActivity,
  getWeakSkillsForStudent,
  getMistakesForStudent,
  getNotificationsForUser,
  getUnreadNotificationCount,
  FREE_MAX_ENERGY,
} from "@/lib/queries";
import { pluralRu } from "@/lib/pluralize";
import StudentDashboardHeader from "@/components/StudentDashboardHeader";
import StudentSidebar from "@/components/StudentSidebar";
import StudentRightColumn from "@/components/StudentRightColumn";
import BottomTabBar from "@/components/BottomTabBar";
import NotificationBell from "@/components/NotificationBell";
import Mascot from "@/components/Mascot";
import VerticalSkillPath from "@/components/VerticalSkillPath";
import HorizontalSkillPath from "@/components/HorizontalSkillPath";
import { IconCrown } from "@/components/icons";

const GEO_TIPS = [
  "Ещё немного — и цель дня закрыта. Серия не оборвётся!",
  "Регулярность важнее длинных сессий — 10 минут каждый день лучше часа раз в неделю.",
  "Если задача не поддаётся — открой формулу-подсказку, это не считается поражением.",
  "Повторение без энергии — отличный способ занять свободную минуту.",
];

export default async function StudentDashboard({
  searchParams,
}: {
  searchParams: { topic?: string };
}) {
  const user = (await getSessionUser())!;

  // Все 12 запросов ниже зависят только от user.id, известного уже сейчас —
  // никакой из них не нуждается в результате другого. Раньше шли строго
  // последовательно (await X; await Y; ...) — 12 круговых задержек до сети
  // Neon подряд. Теперь — один Promise.all, то есть по факту одна задержка
  // вместо двенадцати. Это оказалось главной причиной "долгой загрузки" —
  // не хостинг, а водопад запросов на самом тяжёлом экране приложения.
  const [
    curriculum,
    progress,
    xp,
    streak,
    dailyGoal,
    weekActivity,
    weakSkills,
    notifications,
    unreadCount,
    mistakes,
    allHw,
    dueReviewCount,
  ] = await Promise.all([
    getCurriculum(),
    computeStudentProgress(user.id),
    computeXp(user.id),
    computeStreak(user.id),
    computeDailyGoal(user.id),
    computeWeekActivity(user.id),
    getWeakSkillsForStudent(user.id),
    getNotificationsForUser(user.id),
    getUnreadNotificationCount(user.id),
    getMistakesForStudent(user.id),
    getHomeworksForStudent(user.id),
    getDueReviewCount(user.id),
  ]);

  // Дашборд теперь может обслуживать несколько предметов (тем) — без этого
  // фильтра curriculum.flatMap ниже слил бы навыки Планиметрии и Теории
  // вероятности в одну общую последовательность. По умолчанию (без ?topic=
  // в URL) — первая тема, чтобы все существующие ссылки на /student
  // продолжали работать как раньше.
  const selectedTopic =
    curriculum.find((t) => t.topic.id === searchParams.topic) ?? curriculum[0];
  const curriculumFull = curriculum;
  const curriculumFiltered = selectedTopic ? [selectedTopic] : [];

  const level = getLevelInfo(xp);
  const nextLevelTitle = LEVELS[level.index + 1]?.title ?? null;
  const unresolvedMistakesCount = mistakes.filter((m) => !m.resolved).length;
  const hwStatuses = await Promise.all(allHw.map((h) => homeworkStatus(h, user.id)));
  const pendingHw = allHw.filter((_, i) => !hwStatuses[i].complete);

  const standalone = isStandaloneStudent(user);
  const isFreeStandalone = standalone && !isEffectivelyPro(user);
  const energy = standalone ? Math.floor(getEffectiveEnergy(user)) : null;

  const allSkills = curriculumFiltered.flatMap((t) => t.chapters.flatMap((c) => c.skills));
  const pathStates = getPathStates(allSkills, progress);
  const doneCount = allSkills.filter((s) => pathStates[s.id] === "done").length;

  const problemCountPairs = await Promise.all(
    allSkills.map(async (s) => [s.id, (await getProblemsForSkill(s.id)).length] as const)
  );
  const problemCountBySkill = new Map(problemCountPairs);

  // Текущая глава — та, что содержит навык в статусе "current" (либо первая
  // не полностью пройденная). На ней сфокусирован главный экран — остальные
  // главы получают только компактный тизер внизу (полный список — на
  // отдельной странице программы).
  let currentChapter: (typeof curriculum)[number]["chapters"][number] | null = null;
  let currentChapterIdx = 0;
  outer: for (const { chapters } of curriculumFiltered) {
    for (let i = 0; i < chapters.length; i++) {
      const allDone = chapters[i].skills.every((s) => pathStates[s.id] === "done");
      if (!allDone) {
        currentChapter = chapters[i];
        currentChapterIdx = i;
        break outer;
      }
    }
  }
  if (!currentChapter) {
    currentChapter = curriculumFiltered[0]?.chapters[0] ?? null;
  }
  const chapterLockedByPlan = isFreeStandalone && currentChapterIdx > 0;

  const currentSkill = currentChapter?.skills.find((s) => pathStates[s.id] === "current");
  const currentSkillProblems = currentSkill ? problemCountBySkill.get(currentSkill.id) ?? 0 : 0;
  const currentSkillSolved = currentSkill ? progress[currentSkill.id]?.solved ?? 0 : 0;
  const remaining = Math.max(0, currentSkillProblems - currentSkillSolved);
  const estMinutes = Math.max(2, remaining * 2);

  const chapterDoneCount = currentChapter ? currentChapter.skills.filter((s) => pathStates[s.id] === "done").length : 0;

  const tip = GEO_TIPS[new Date().getDate() % GEO_TIPS.length];
  const todayLabel = new Date()
    .toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })
    .toUpperCase();
  const firstName = user.name.split(" ")[0];

  const heroCard = currentSkill && !chapterLockedByPlan ? (
    <a
      href={`/student/skill/${currentSkill.id}`}
      className="block rounded-[22px] bg-pine-dark p-6 text-white transition hover:brightness-105"
    >
      <p className="text-[11px] font-black uppercase tracking-wide text-white/60">
        Продолжить · {currentChapter?.chapter.title}
      </p>
      <h1 className="mt-1.5 font-display text-2xl font-black leading-tight">{currentSkill.title}</h1>
      <p className="mt-1.5 text-[14px] font-semibold text-white/75">
        Осталось {remaining} {pluralRu(remaining, ["задача", "задачи", "задач"])} · ~{estMinutes} мин
        {energy !== null && " · 1 энергия"}
      </p>
      <span className="mt-5 inline-flex h-[52px] items-center justify-center rounded-pill bg-pine px-8 text-[15px] font-black text-white shadow-[0_3px_0_0_rgba(0,0,0,0.25)]">
        Решать дальше →
      </span>
    </a>
  ) : chapterLockedByPlan ? (
    <a
      href="/student/upgrade"
      className="block rounded-[22px] bg-gradient-to-br from-amber to-coral p-6 text-white"
    >
      <p className="text-[11px] font-black uppercase tracking-wide text-white/70">PRO</p>
      <h1 className="mt-1.5 font-display text-2xl font-black leading-tight">
        Открой «{currentChapter?.chapter.title}» и весь курс
      </h1>
      <p className="mt-1.5 text-[14px] font-semibold text-white/85">
        На бесплатном плане доступна только первая глава
      </p>
      <span className="mt-5 inline-flex h-[52px] items-center justify-center rounded-pill bg-white px-8 text-[15px] font-black text-coral">
        Узнать про Pro →
      </span>
    </a>
  ) : (
    <div className="rounded-[22px] bg-pine-dark p-6 text-center text-white">
      <Mascot mood="celebrating" size={72} float={false} className="mx-auto" />
      <p className="mt-2 font-display text-xl font-black">Вся программа пройдена!</p>
      <p className="mt-1 text-sm text-white/75">Загляни в повторение — там всегда есть чем заняться.</p>
    </div>
  );

  const tiles = (
    <>
      <a href="/student/review" className="flex-1 rounded-2xl bg-violet-light px-3.5 py-3 transition hover:brightness-95">
        <p className="text-[11px] font-black uppercase tracking-wide text-violet-text">Повторение</p>
        <p className="mt-1 font-display text-[17px] font-black text-ink">
          {dueReviewCount} {pluralRu(dueReviewCount, ["задача", "задачи", "задач"])}
        </p>
        <p className="text-[12px] font-semibold text-ink-soft">без энергии</p>
      </a>
      <a href="/student/homework" className="flex-1 rounded-2xl bg-amber-light px-3.5 py-3 transition hover:brightness-95">
        <p className="text-[11px] font-black uppercase tracking-wide text-amber-text">
          {standalone ? "Пробники" : "Домашка"}
        </p>
        <p className="mt-1 font-display text-[17px] font-black text-ink">
          {pendingHw.length} {pluralRu(pendingHw.length, ["задание", "задания", "заданий"])}
        </p>
        <p className="text-[12px] font-semibold text-ink-soft">
          {pendingHw.length > 0 ? "ждут выполнения" : "всё выполнено"}
        </p>
      </a>
    </>
  );

  const programTeaser = (
    <a href="/student/program" className="block rounded-2xl border border-dashed border-line bg-white px-4 py-3.5 transition hover:border-pine">
      <p className="flex items-center gap-1.5 font-display text-sm font-black text-ink">
        {isFreeStandalone && <IconCrown className="h-4 w-4 text-amber" />}
        Программа курса
      </p>
      <p className="mt-1 text-[12px] text-ink-soft">
        {curriculumFiltered[0]?.chapters.length ?? 0} глав ·{" "}
        {allSkills.length} {pluralRu(allSkills.length, ["навык", "навыка", "навыков"])} · пройдено {doneCount}
      </p>
    </a>
  );

  return (
    <div>
      {/* ---------- МОБИЛЬНАЯ РАСКЛАДКА (< 1024px) ---------- */}
      <div className="min-h-screen bg-paper pb-24 lg:hidden">
        <StudentDashboardHeader
          userId={user.id}
          levelTitle={level.title}
          xp={xp}
          streak={streak}
          energy={energy}
          energyMax={FREE_MAX_ENERGY}
          dailyGoal={dailyGoal}
        />
        <main className="space-y-4 px-[18px] py-4">
          {heroCard}
          <div className="flex gap-2.5">{tiles}</div>
          {currentChapter && !chapterLockedByPlan && (
            <div>
              <div className="mb-3 flex items-center justify-between px-1">
                <p className="text-[12px] font-black uppercase tracking-wide text-ink-soft">
                  {currentChapter.chapter.title}
                </p>
                <p className="text-[12px] font-bold text-ink-soft">
                  {chapterDoneCount}/{currentChapter.skills.length}
                </p>
              </div>
              <VerticalSkillPath
                skills={currentChapter.skills.map((s) => ({
                  id: s.id,
                  title: s.title,
                  state: pathStates[s.id],
                  problemsCount: problemCountBySkill.get(s.id) ?? 0,
                  factsCount: s.theoryCards.length,
                  solvedCount: progress[s.id]?.solved ?? 0,
                }))}
              />
            </div>
          )}
          {programTeaser}
        </main>
        <BottomTabBar reviewCount={dueReviewCount} mistakesCount={unresolvedMistakesCount} homeworkLabel={standalone ? "Пробники" : "Задания"} />
      </div>

      {/* ---------- ДЕСКТОПНАЯ РАСКЛАДКА (≥ 1024px) ---------- */}
      <div className="hidden min-h-screen bg-paper lg:block">
        <StudentSidebar
          active="path"
          reviewCount={dueReviewCount}
          homeworkCount={pendingHw.length}
          homeworkLabel={standalone ? "Пробники" : "Домашка"}
          mistakesCount={unresolvedMistakesCount}
          energy={energy}
          energyMax={FREE_MAX_ENERGY}
          isPro={!standalone || isEffectivelyPro(user)}
          notifications={notifications}
          unreadCount={unreadCount}
        />
        <div className="ml-[236px] flex gap-6 px-8 py-6">
          <main className="min-w-0 flex-1 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] font-black uppercase tracking-wide text-ink-soft">{todayLabel}</p>
                <h1 className="mt-0.5 font-display text-2xl font-black text-ink">
                  Привет, {firstName}. {dailyGoal.total - dailyGoal.done > 0
                    ? `Осталось ${dailyGoal.total - dailyGoal.done} ${pluralRu(dailyGoal.total - dailyGoal.done, ["задача", "задачи", "задач"])} до цели дня.`
                    : "Цель дня закрыта!"}
                </h1>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-pill bg-amber-light px-3 py-1.5 text-[13px] font-black text-amber-text">
                  ⚡ {xp} XP
                </span>
                <span className="rounded-pill bg-coral-light px-3 py-1.5 text-[13px] font-black text-coral-text">
                  🔥 {streak}
                </span>
                <NotificationBell initialNotifications={notifications} initialUnread={unreadCount} />
              </div>
            </div>

            {heroCard}
            <div className="flex gap-3">{tiles}</div>

            {currentChapter && !chapterLockedByPlan && (
              <div className="card p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="font-display text-lg font-black text-ink">{currentChapter.chapter.title}</h2>
                  <p className="text-[13px] font-bold text-ink-soft">
                    {chapterDoneCount} из {currentChapter.skills.length} навыков
                  </p>
                </div>
                <HorizontalSkillPath
                  skills={currentChapter.skills.map((s) => ({
                    id: s.id,
                    title: s.title,
                    state: pathStates[s.id],
                    problemsCount: problemCountBySkill.get(s.id) ?? 0,
                    solvedCount: progress[s.id]?.solved ?? 0,
                  }))}
                />
              </div>
            )}

            {programTeaser}
          </main>

          <StudentRightColumn
            level={level}
            nextLevelTitle={nextLevelTitle}
            weekActivity={weekActivity}
            weakSkills={weakSkills}
            tip={tip}
          />
        </div>
      </div>
    </div>
  );
}
