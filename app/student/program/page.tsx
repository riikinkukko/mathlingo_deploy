import { getSessionUser } from "@/lib/auth";
import {
  getCurriculum,
  computeStudentProgress,
  getPathStates,
  getProblemsForSkill,
  isStandaloneStudent,
  isEffectivelyPro,
  getEffectiveEnergy,
  getDueReviewCount,
  getHomeworksForStudent,
  homeworkStatus,
  FREE_MAX_ENERGY,
} from "@/lib/queries";
import { isYooKassaConfigured } from "@/lib/yookassa";
import { pluralRu } from "@/lib/pluralize";
import { upgradeToProAction } from "@/app/actions";
import { startPaymentAction } from "@/app/actions-payments";
import StudentSidebar from "@/components/StudentSidebar";

export default async function ProgramPage() {
  const user = (await getSessionUser())!;
  const curriculum = await getCurriculum();
  const progress = await computeStudentProgress(user.id);
  const allSkills = curriculum.flatMap((t) => t.chapters.flatMap((c) => c.skills));
  const pathStates = getPathStates(allSkills, progress);

  const standalone = isStandaloneStudent(user);
  const energy = standalone ? Math.floor(getEffectiveEnergy(user)) : null;
  const dueReviewCount = await getDueReviewCount(user.id);
  const allHw = await getHomeworksForStudent(user.id);
  const hwStatuses = await Promise.all(allHw.map((h) => homeworkStatus(h, user.id)));
  const pendingHwCount = allHw.filter((_, i) => !hwStatuses[i].complete).length;
  const isFreeStandalone = standalone && !isEffectivelyPro(user);
  const realPayments = isYooKassaConfigured();
  const priceRub = Number(process.env.YOOKASSA_PRICE_RUB || 399);
  const periodDays = Number(process.env.YOOKASSA_PERIOD_DAYS || 30);

  const chapterInfo = await Promise.all(
    curriculum[0].chapters.map(async ({ chapter, skills }) => {
      const problemCounts = await Promise.all(skills.map((s) => getProblemsForSkill(s.id, true)));
      const totalProblems = problemCounts.reduce((sum, p) => sum + p.length, 0);
      const doneSkills = skills.filter((s) => pathStates[s.id] === "done").length;
      const firstSkill = [...skills].sort((a, b) => a.order - b.order)[0];
      const fullyOpen = !isFreeStandalone || chapter.order === 1;
      return { chapter, skills, totalProblems, doneSkills, firstSkill, fullyOpen };
    })
  );

  const totalSkills = allSkills.length;
  const totalDone = allSkills.filter((s) => pathStates[s.id] === "done").length;
  const totalProblemsAll = chapterInfo.reduce((sum, c) => sum + c.totalProblems, 0);

  return (
    <div className="min-h-screen bg-paper pb-20">
      <StudentSidebar
        active="path"
        reviewCount={dueReviewCount}
        homeworkCount={pendingHwCount}
        homeworkLabel={standalone ? "Пробники" : "Домашка"}
        energy={energy}
        energyMax={FREE_MAX_ENERGY}
        isPro={!standalone || isEffectivelyPro(user)}
      />
      <div className="px-4 py-6 lg:pl-[260px] lg:pr-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-2xl font-black text-ink">Программа планиметрии</h1>
        <p className="mt-1.5 text-sm text-ink-soft">
          {curriculum[0].chapters.length} глав · {totalSkills} {pluralRu(totalSkills, ["навык", "навыка", "навыков"])} ·{" "}
          {totalProblemsAll} {pluralRu(totalProblemsAll, ["задача", "задачи", "задач"])}.
          {isFreeStandalone && " Бесплатно: вся глава «Треугольники» и первый навык каждой следующей."}
        </p>

        <div className="mt-6 space-y-3">
          {chapterInfo.map(({ chapter, skills, totalProblems, doneSkills, firstSkill, fullyOpen }) => (
            <div
              key={chapter.id}
              className={`rounded-2xl p-4 ${chapter.order === 1 ? "bg-pine-light" : "bg-pine-light/40"}`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pine font-display text-base font-black text-white">
                    {chapter.order}
                  </span>
                  <div>
                    <p className="font-display text-[15px] font-black text-ink">{chapter.title}</p>
                    <p className="text-[12.5px] text-ink-soft">
                      {skills.length} {pluralRu(skills.length, ["навык", "навыка", "навыков"])} ·{" "}
                      {fullyOpen
                        ? `открыто полностью · пройдено ${doneSkills}`
                        : `${totalProblems} ${pluralRu(totalProblems, ["задача", "задачи", "задач"])}`}
                    </p>
                  </div>
                </div>
                {fullyOpen ? (
                  chapter.order !== 1 && (
                    <span className="shrink-0 text-[12px] font-extrabold text-pine">
                      {doneSkills}/{skills.length}
                    </span>
                  )
                ) : (
                  <a
                    href={`/student/skill/${firstSkill.id}`}
                    className="shrink-0 rounded-pill border-2 border-pine px-4 py-2 text-[12.5px] font-extrabold text-pine transition hover:bg-pine hover:text-white"
                  >
                    Попробовать 1 навык
                  </a>
                )}
              </div>
              {fullyOpen && chapter.order === 1 && (
                <div className="mt-3 h-2 w-full overflow-hidden rounded-pill bg-white/60">
                  <div
                    className="h-full rounded-pill bg-pine transition-all"
                    style={{ width: `${skills.length ? Math.round((doneSkills / skills.length) * 100) : 0}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {isFreeStandalone && (
          <div className="mt-6 rounded-[22px] bg-pine-dark p-6 text-white">
            <p className="text-[11px] font-black uppercase tracking-wide text-white/60">
              PRO {!realPayments && "· для демонстрации бесплатно"}
            </p>
            <h2 className="mt-1.5 font-display text-xl font-black leading-tight">
              Ты решил {totalDone} {pluralRu(totalDone, ["навык", "навыка", "навыков"])} из {totalSkills}. Открой
              остальные {totalSkills - totalDone}.
            </h2>
            <ul className="mt-4 space-y-1.5 text-[13.5px] text-white/85">
              <li>• Без лимита энергии — сколько задач захочешь в день</li>
              <li>• Развёрнутые задачи с эталонным решением для самопроверки</li>
              <li>• Авторские пробники и вся программа целиком</li>
            </ul>
            {realPayments ? (
              <form action={startPaymentAction} className="mt-5">
                <button className="btn-primary !h-12 !bg-amber !text-[15px]" type="submit">
                  Оплатить {priceRub} ₽ / {periodDays} дн. →
                </button>
              </form>
            ) : (
              <form action={upgradeToProAction} className="mt-5">
                <button className="btn-primary !h-12 !bg-amber !text-[15px]" type="submit">
                  Открыть Pro →
                </button>
              </form>
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
