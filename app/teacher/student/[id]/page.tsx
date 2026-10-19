import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import {
  getCurriculum,
  computeStudentProgress,
  computeOverallStats,
  getHomeworksForStudent,
  homeworkStatus,
  getUserById,
  getMistakesForStudent,
  getLessonLogsForStudent,
  getPendingReviewsForTeacher,
  getParentsOfStudent,
  getUpcomingLessonsForStudent,
  getStudentBalance,
  getStudentPayments,
  getMockScores,
  getStudentNotes,
  getWeeklyStats,
  getUnmarkedPastLessons,
  getScheduledLessonById,
  getRecentReviewedForStudent,
} from "@/lib/queries";
import { scoreLabel } from "@/lib/ege-points";
import LessonDoneBanner from "@/components/LessonDoneBanner";
import StudentDynamicsSection from "@/components/StudentDynamicsSection";
import { formatDateRu } from "@/lib/money";
import GoalCard from "@/components/GoalCard";
import {
  TargetScoreForm,
  AddMockScoreForm,
  DeleteMockButton,
  StudentNotesForm,
} from "@/components/StudentGoalForms";
import { pluralRu } from "@/lib/pluralize";
import TeacherShell from "@/components/TeacherShell";
import GradeBadge from "@/components/GradeBadge";
import CollapsibleSection from "@/components/CollapsibleSection";
import SkillsProgressSummary from "@/components/SkillsProgressSummary";
import RecentList from "@/components/RecentList";
import AddLessonForm from "@/components/AddLessonForm";
import UpcomingLessons from "@/components/UpcomingLessons";
import { lessonTimeRange } from "@/lib/lesson-time";
import AddPaymentForm from "@/components/AddPaymentForm";
import PaymentHistory from "@/components/PaymentHistory";
import BalanceSummary, { balanceText } from "@/components/BalanceSummary";
import { debtText, hasDebt } from "@/lib/money";
import { PaymentReminderControls, LessonPriceForm } from "@/components/PaymentReminderControls";
import { getGroupNamesByStudent } from "@/lib/groups";
import AddParentForm from "./AddParentForm";
import LessonLogForm from "./LessonLogForm";
import PendingReviewCard from "./PendingReviewCard";
import ScrollIntoViewOnMount from "@/components/teacher/ScrollIntoViewOnMount";
import DeleteStudentButton from "./DeleteStudentButton";
import { listMockAttempts } from "@/lib/mock-queries";
import { MOCK_MODES, isMockMode } from "@/lib/mock-exam";

const KIND_LABEL: Record<string, string> = {
  homework: "Домашка",
  test: "Контрольная",
  exam: "Пробник",
};

export default async function StudentDetailPage(
  props: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{
      done?: string;
      log?: string;
      tab?: string;
      ok?: string;
      hw?: string;
      quick?: string;
      /** число задач в только что назначенном вручную задании */
      assigned?: string;
      /** запись в журнал не сохранилась */
      logerror?: string;
    }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const teacher = (await getSessionUser())!;
  const student = await getUserById(params.id);
  if (!student || student.role !== "STUDENT" || student.teacherId !== teacher.id) {
    notFound();
  }

  // ?done=<id> — только что отмечено «Провести/Было» → плашка «Записать отчёт».
  // ?log=<id>  — пришли по этой плашке → журнал открыт, форма заполнена.
  // Оба занятия проверяем: своё и этого ученика.
  const ownLesson = async (id?: string) => {
    if (!id) return undefined;
    const l = await getScheduledLessonById(id);
    return l && l.teacherId === teacher.id && l.studentId === student.id ? l : undefined;
  };
  const [doneLesson, logLesson] = await Promise.all([ownLesson(searchParams.done), ownLesson(searchParams.log)]);
  const logPrefill = logLesson
    ? {
        date: new Intl.DateTimeFormat("en-CA", {
          timeZone: "Europe/Moscow",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(logLesson.startsAt)),
        topic: logLesson.topic ?? "",
      }
    : undefined;

  // Вкладки карточки (как в макете): ?tab=. Ссылки из уведомлений и
  // редиректы после действий сами открывают нужную вкладку.
  const TABS = [
    { key: "overview", label: "Обзор" },
    { key: "lessons", label: "Занятия" },
    { key: "payments", label: "Оплаты" },
    { key: "hw", label: "ДЗ" },
  ] as const;
  type TabKey = (typeof TABS)[number]["key"];
  const tab: TabKey =
    (TABS.find((t) => t.key === searchParams.tab)?.key as TabKey | undefined) ??
    (searchParams.done || searchParams.log || searchParams.ok === "lesson"
      ? "lessons"
      : searchParams.hw
        ? "hw"
        : "overview");

  const [
    curriculum,
    progress,
    stats,
    homeworks,
    mistakesRaw,
    lessonLogs,
    pendingReviewsRaw,
    parents,
    upcomingLessons,
    balance,
    payments,
    mocks,
    notesData,
    weekly,
    unmarkedLessons,
    reviewed,
  ] = await Promise.all([
      getCurriculum(),
      computeStudentProgress(student.id),
      computeOverallStats(student.id),
      getHomeworksForStudent(student.id),
      getMistakesForStudent(student.id),
      getLessonLogsForStudent(student.id),
      getPendingReviewsForTeacher(teacher.id),
      getParentsOfStudent(student.id),
      getUpcomingLessonsForStudent(student.id),
      getStudentBalance(teacher.id, student.id),
      getStudentPayments(student.id),
      getMockScores(student.id),
      getStudentNotes(student.id),
      getWeeklyStats(student.id, 12),
      getUnmarkedPastLessons(teacher.id, student.id),
      getRecentReviewedForStudent(student.id, 5),
    ]);
  const platformMocks = await listMockAttempts(student.id);
  const inGroup = ((await getGroupNamesByStudent(teacher.id)).get(student.id) ?? []).length > 0;
  const solved12w = weekly.reduce((s, w) => s + w.solved, 0);
  const notesUpdatedLabel = notesData.updatedAt
    ? new Date(notesData.updatedAt).toLocaleString("ru-RU", {
        timeZone: "Europe/Moscow",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  const notesPreview = notesData.notes.trim().split("\n")[0]?.slice(0, 60);
  const hwStatuses = await Promise.all(homeworks.map((h) => homeworkStatus(h, student.id)));
  const mistakes = mistakesRaw.slice(0, 8);
  const pendingReviews = pendingReviewsRaw.filter((r) => r.student.id === student.id);
  const assignedCount = Number(searchParams.quick) > 0 ? Number(searchParams.quick) : Number(searchParams.assigned) || 0;

  const parentsAndDelete = (
    <>
        <section id="parents" className="scroll-mt-24">
          <h2 className="mb-3 font-display text-lg font-black text-ink">Родители</h2>
          {parents.length > 0 && (
            <ul className="mb-4 space-y-1 text-sm text-ink-soft">
              {parents.map((p) => (
                <li key={p.id}>
                  {p.name} — {p.email}
                </li>
              ))}
            </ul>
          )}
          <div className="card p-5">
            <p className="mb-3 text-sm text-ink-soft">
              Пригласите родителя — он сможет следить за прогрессом, журналом занятий и заданиями ученика.
            </p>
            <AddParentForm studentId={student.id} />
          </div>
        </section>

        <section className="mt-8 border-t border-line-soft pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-ink">Удаление ученика</p>
              <p className="mt-0.5 text-xs text-ink-soft">
                Если ученик перестал заниматься — удалите его, чтобы освободить место. Действие необратимо.
              </p>
            </div>
            <DeleteStudentButton studentId={student.id} studentName={student.name} />
          </div>
        </section>
    </>
  );

  return (
    <TeacherShell active="students" title={student.name}>
      <main className="mx-auto max-w-3xl px-4 pb-8 pt-4 lg:max-w-[1200px]">
        <a href="/teacher#students" className="mb-2 hidden text-[13px] font-bold text-ink-soft hover:text-pine-dark hover:underline lg:inline-block">
          ← Мои ученики
        </a>
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-pine-light font-display text-[17px] font-black text-pine-dark">
            {student.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-[22px] font-black text-ink">{student.name}</h1>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {balance && hasDebt(balance) && (
                <span className="rounded-pill bg-coral-light px-2.5 py-0.5 text-[12px] font-black text-coral-text">
                  Долг {debtText(balance)}
                </span>
              )}
              {student.targetScore && (
                <span className="rounded-pill border border-line-soft bg-white px-2.5 py-0.5 text-[12px] font-bold text-ink-soft">
                  Цель {student.targetScore}
                </span>
              )}
              {upcomingLessons[0] && (
                <span className="rounded-pill border border-line-soft bg-white px-2.5 py-0.5 text-[12px] font-bold text-ink-soft">
                  {new Date(upcomingLessons[0].startsAt).toLocaleString("ru-RU", {
                    timeZone: "Europe/Moscow",
                    weekday: "short",
                  })}{" "}
                  {lessonTimeRange(upcomingLessons[0].startsAt, upcomingLessons[0].durationMin)}
                </span>
              )}
              {pendingReviews.length > 0 && (
                <span className="rounded-pill bg-violet-light px-2.5 py-0.5 text-[12px] font-black text-violet-text">
                  На проверке {pendingReviews.length}
                </span>
              )}
            </div>
          </div>
          {/* Обёртка: класс btn-primary перебивает hidden у самой ссылки. */}
          <div className="hidden lg:block">
            <a href={`/teacher/homework/new?studentId=${student.id}`} className="btn-primary">
              + Задать задание
            </a>
          </div>
        </div>

        <nav
          aria-label="Разделы ученика"
          className="sticky top-[calc(var(--app-sat)+57px)] z-20 -mx-4 mb-4 bg-paper px-4 py-2 lg:top-0"
        >
          <div className="grid grid-cols-4 rounded-2xl bg-grid p-1">
            {TABS.map((t) => (
              <a
                key={t.key}
                href={`/teacher/student/${student.id}${t.key === "overview" ? "" : `?tab=${t.key}`}`}
                aria-current={tab === t.key ? "page" : undefined}
                className={`flex h-10 items-center justify-center rounded-xl text-[14px] transition ${
                  tab === t.key ? "bg-white font-black text-ink shadow-soft" : "font-bold text-ink-soft"
                }`}
              >
                {t.label}
              </a>
            ))}
          </div>
        </nav>

        {tab === "overview" && (
          <div className="mb-4 grid grid-cols-3 gap-2">
            <StatChip label="решено задач" value={`${stats.solvedProblems}`} />
            <StatChip label="точность" value={`${stats.accuracy}%`} />
            <StatChip label="дней за неделю" value={`${stats.activeDaysLast7}/7`} />
          </div>
        )}
        {tab === "overview" && (
          <div className="mb-5 grid grid-cols-2 gap-2 lg:!hidden">
            <a href={`/teacher/homework/new?studentId=${student.id}`} className="btn-primary !h-12 !normal-case !tracking-normal !text-[15px]">
              Задать ДЗ
            </a>
            <a href={`/teacher/student/${student.id}?tab=payments`} className="btn-secondary !h-12 !normal-case !tracking-normal !text-[15px]">
              Записать оплату
            </a>
          </div>
        )}

        {tab === "lessons" && (<>
        {doneLesson && doneLesson.status === "done" && (
          <LessonDoneBanner lesson={doneLesson} onStudentPage />
        )}
        </>)}

        {tab === "overview" && (<>
        {/* Телефон — одна колонка в прежнем порядке (order-*). lg: слева работа
            ученика (проверки, динамика), справа цель, пробники, заметки, родители. */}
        <div className="flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-x-8">
          <div className="contents lg:block">
            <div className="order-2 lg:order-none">
              {pendingReviews.length > 0 && (
                <section id="review" className="mb-8 scroll-mt-32">
                  <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-black text-ink">
                    На проверке
                    <span className="rounded-pill bg-amber px-2 py-0.5 text-xs text-white">
                      {pendingReviews.length}
                    </span>
                  </h2>
                  <div className="space-y-3">
                    {pendingReviews.map((r) => (
                      <PendingReviewCard key={r.attemptId} review={r} />
                    ))}
                  </div>
                </section>
              )}
            </div>
            <div className="order-3 lg:order-none">
              {reviewed.length > 0 && (
                <CollapsibleSection
                  title="Проверенные решения"
                  summary={`последние ${reviewed.length}`}
                  defaultOpen={pendingReviews.length === 0}
                >
                  <ul className="space-y-2">
                    {reviewed.map((r) => (
                      <li key={r.attemptId} className="card flex items-center gap-3 p-3.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-bold text-ink-soft">
                            {r.egeTaskNumber ? `№${r.egeTaskNumber} · ` : ""}
                            {r.skillTitle} ·{" "}
                      {new Date(r.submittedAt).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "short" })}
                          </p>
                          <p className="truncate text-sm text-ink">{r.problemText}</p>
                        </div>
                        {r.score !== null && (
                          <span className="shrink-0 rounded-pill bg-paper px-2.5 py-1 font-mono text-[12px] font-black text-ink" title={scoreLabel(r.score, r.maxScore)}>
                            {r.score}/{r.maxScore}
                          </span>
                        )}
                        <span
                          className={`shrink-0 rounded-pill px-2.5 py-1 text-[11px] font-black ${
                            r.decision === "approved" ? "bg-pine-light text-pine-dark" : "bg-coral-light text-coral-text"
                          }`}
                        >
                          {r.decision === "approved" ? "одобрено" : "на доработке"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CollapsibleSection>
              )}
            </div>
            <div className="order-6 lg:order-none">
              <CollapsibleSection
                title="Динамика"
                summary={`${solved12w} ${pluralRu(solved12w, ["задача", "задачи", "задач"])} за 12 недель`}
                defaultOpen
              >
                <StudentDynamicsSection weekly={weekly} mocks={mocks} targetScore={student.targetScore} />
              </CollapsibleSection>
            </div>
            <div className="order-7 lg:order-none">
              {parentsAndDelete}
            </div>
          </div>
          <div className="contents lg:block">
            <div className="order-1 lg:order-none">
              <GoalCard targetScore={student.targetScore} mocks={mocks} />
            </div>
            <div className="order-4 lg:order-none">
              <div id="mocks" className="scroll-mt-20">
                <CollapsibleSection
                  title="Пробники на платформе"
                  summary={
                    platformMocks.length > 0
                      ? `${platformMocks.length} ${pluralRu(platformMocks.length, ["вариант", "варианта", "вариантов"])}`
                      : "пока не решал"
                  }
                  defaultOpen={platformMocks.length > 0}
                >
                  {platformMocks.length > 0 ? (
                    <ul className="space-y-2">
                      {platformMocks.slice(0, 10).map((pm) => {
                        const finished = !!pm.finishedAt;
                        const date = new Date(pm.finishedAt ?? pm.startedAt).toLocaleDateString("ru-RU", {
                          timeZone: "Europe/Moscow",
                          day: "numeric",
                          month: "short",
                        });
                        return (
                          <li key={pm.id}>
                            <a
                              href={`/teacher/student/${student.id}/mock/${pm.id}`}
                              className="card flex items-center gap-3 p-3.5 transition hover:border-pine"
                            >
                              <span className="min-w-[44px] font-mono text-lg font-bold text-ink">
                                {finished ? pm.testScore ?? 0 : "…"}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-xs font-semibold text-ink">
                                  Вариант {pm.variant} · {date}
                                </span>
                                <span className="block truncate text-xs text-ink-soft">
                                  {isMockMode(pm.mode) ? MOCK_MODES[pm.mode].title : ""}
                                  {finished ? ` · ${pm.primaryScore ?? 0} перв.` : " · решает сейчас"}
                                </span>
                              </span>
                              {pm.part2Pending > 0 && (
                                <span className="shrink-0 rounded-pill bg-amber px-2 py-0.5 text-[11px] font-black text-white">
                                  проверить {pm.part2Pending}
                                </span>
                              )}
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className="card p-5 text-center text-sm text-ink-soft">
                      Ученик ещё не решал пробники. Они в разделе «Пробники ЕГЭ» у него в кабинете: 20 вариантов в формате
                      экзамена. Вторая часть придёт к вам на проверку.
                    </div>
                  )}
                </CollapsibleSection>
              </div>
              <div id="goal" className="scroll-mt-20">
                <CollapsibleSection
                  title="Цель и пробники"
                  summary={
                    mocks.length > 0
                      ? `${mocks.length} ${pluralRu(mocks.length, ["пробник", "пробника", "пробников"])}`
                      : undefined
                  }
                  defaultOpen={!student.targetScore}
                >
                  <div className="card mb-4 p-4">
                    <TargetScoreForm studentId={student.id} targetScore={student.targetScore} />
                  </div>
                  <div className="mb-4">
                    <AddMockScoreForm studentId={student.id} />
                  </div>
                  {mocks.length > 0 ? (
                    <div className="space-y-2">
                      {mocks.map((m) => (
                        <div key={m.id} className="card flex items-center gap-3 p-3.5">
                          <span className="min-w-[44px] font-mono text-lg font-bold text-ink">{m.score}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-ink">{formatDateRu(m.takenAt)}</p>
                            {m.note &&
                              (m.id.startsWith("mks_") ? (
                                <a href={`/teacher/student/${student.id}/mock/${m.id.slice(4)}`} className="block truncate text-xs font-bold text-pine hover:underline">
                                  {m.note} · разбор
                                </a>
                              ) : (
                                <p className="truncate text-xs text-ink-soft">{m.note}</p>
                              ))}
                          </div>
                          <DeleteMockButton mockId={m.id} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="card p-6 text-center text-sm text-ink-soft">Пробников пока не записано.</div>
                  )}
                </CollapsibleSection>
              </div>
            </div>
            <div className="order-5 lg:order-none">
              <CollapsibleSection title="Заметки" summary={notesPreview || undefined}>
                <StudentNotesForm
                  studentId={student.id}
                  notes={notesData.notes}
                  updatedLabel={notesUpdatedLabel}
                />
              </CollapsibleSection>
            </div>
          </div>
        </div>
        </>)}

        {tab === "hw" && assignedCount > 0 && (
          <ScrollIntoViewOnMount role="status" className="mb-4 rounded-2xl bg-pine-light px-4 py-3 text-sm font-bold text-pine-dark">
            ✓ Задание из {assignedCount} {pluralRu(assignedCount, ["задачи", "задач", "задач"])} назначено — ученик получил уведомление.
          </ScrollIntoViewOnMount>
        )}
        {tab === "hw" && (<>
        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-8">
        <div>
        <CollapsibleSection
          title="Прогресс по навыкам"
          summary={`${stats.solvedProblems}/${stats.totalProblems} задач`}
        >
          <SkillsProgressSummary curriculum={curriculum} progress={progress} />
        </CollapsibleSection>

        <CollapsibleSection
          title="Разбор ошибок"
          defaultOpen
          summary={mistakes.length > 0 ? `${mistakes.length} ${pluralRu(mistakes.length, ["ошибка", "ошибки", "ошибок"])}` : undefined}
        >
          <RecentList
            limit={4}
            emptyText="Пока нет зафиксированных ошибок — отлично!"
            items={mistakes.map((m) => (
              <div key={m.problem.id} className="card p-3.5">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-pill bg-coral-light px-2 py-0.5 text-[11px] font-extrabold text-coral">
                    {m.skillTitle}
                  </span>
                  <span className="text-[11px] text-ink-soft">
                    {m.wrongAttempts} {pluralRu(m.wrongAttempts, ["ошибка", "ошибки", "ошибок"])}
                    {m.resolved ? " · в итоге решено верно" : " · пока не решено"}
                  </span>
                </div>
                <p className="text-sm text-ink">{m.problem.text}</p>
                <p className="mt-1 text-xs text-ink-soft">
                  Последний ответ ученика: <span className="font-mono">{m.lastWrongAnswer}</span>
                </p>
              </div>
            ))}
          />
        </CollapsibleSection>

        </div>
        <div>
        <CollapsibleSection
          title="Задания"
          summary={homeworks.length > 0 ? `${homeworks.length} ${pluralRu(homeworks.length, ["задание", "задания", "заданий"])}` : undefined}
          defaultOpen
        >
          <RecentList
            limit={4}
            emptyText="Пока нет назначенных заданий."
            items={homeworks.map((hw, i) => {
              const st = hwStatuses[i];
              return (
                <div key={hw.id} className="card flex items-center justify-between p-3.5">
                  <div>
                    <p className="text-[10px] font-extrabold uppercase text-ink-soft">
                      {KIND_LABEL[hw.kind] ?? "Задание"}
                    </p>
                    <p className="text-sm font-semibold text-ink">{hw.title}</p>
                    <p className="text-xs text-ink-soft">
                      Срок: {new Date(hw.dueDate).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" })}
                      {st.overdue && <span className="ml-2 text-coral">просрочено</span>}
                    </p>
                  </div>
                  <GradeBadge solved={st.done} total={st.total} size="sm" showFraction />
                </div>
              );
            })}
          />
        </CollapsibleSection>
        </div>
        </div>
        </>)}

        {tab === "payments" && (<>
        <div className="lg:max-w-3xl">
        <CollapsibleSection
          title="Оплаты"
          summary={balance ? balanceText(balance) : undefined}
          defaultOpen
        >
          {balance && <BalanceSummary balance={balance} />}
          <LessonPriceForm
            studentId={student.id}
            price={student.lessonPriceRub ?? null}
            groupPrice={student.groupLessonPriceRub ?? null}
            inGroup={inGroup}
          />
          <PaymentReminderControls
            studentId={student.id}
            enabled={!!student.paymentRemindersEnabled}
            recipientsLabel={
              parents.length > 0
                ? parents.map((p) => p.name).join(", ")
                : `${student.name} (родители не приглашены)`
            }
            hasInstructions={!!teacher.paymentInstructions}
          />
          <div className="mb-4">
            <AddPaymentForm studentId={student.id} priceRub={student.lessonPriceRub ?? null} />
          </div>
          <PaymentHistory payments={payments} showStudent={false} from="student" />
        </CollapsibleSection>
        </div>
        </>)}

        {tab === "lessons" && (<>
        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-8">
        <div>
        <CollapsibleSection
          title="Расписание занятий"
          summary={
            [
              upcomingLessons.length > 0
                ? `${upcomingLessons.length} ${pluralRu(upcomingLessons.length, ["занятие", "занятия", "занятий"])} впереди`
                : null,
              unmarkedLessons.length > 0 ? `${unmarkedLessons.length} не отмечено` : null,
            ]
              .filter(Boolean)
              .join(" · ") || undefined
          }
          defaultOpen
        >
          {unmarkedLessons.length > 0 && (
            <div className="mb-4 rounded-card border-2 border-amber/40 bg-amber-light/30 p-3">
              <p className="mb-2 text-sm font-bold text-ink">
                Прошедшие занятия без отметки — от «Было» зависит баланс оплат
              </p>
              <UpcomingLessons lessons={unmarkedLessons} showStudent={false} from="student" past />
            </div>
          )}
          <div className="mb-4">
            <UpcomingLessons lessons={upcomingLessons} showStudent={false} from="student" limit={6} />
          </div>
          <AddLessonForm studentId={student.id} from="student" />
        </CollapsibleSection>
        </div>
        <div>
        {searchParams.logerror && (
          <ScrollIntoViewOnMount role="alert" className="mb-4 rounded-2xl border-2 border-coral/40 bg-coral-light px-4 py-3 text-sm font-bold text-coral-text">
            Запись не сохранилась: заполните дату, тему и отчёт о занятии и попробуйте ещё раз.
          </ScrollIntoViewOnMount>
        )}
        <div id="journal" className="scroll-mt-20">
        <CollapsibleSection
          title="Журнал занятий"
          summary={lessonLogs.length > 0 ? `${lessonLogs.length} ${pluralRu(lessonLogs.length, ["запись", "записи", "записей"])}` : undefined}
          defaultOpen={!!logPrefill || !!searchParams.logerror}
        >
          <div className="mb-4">
            <RecentList
              limit={3}
              emptyText="Занятий пока не записано."
              items={lessonLogs.map((log) => (
                <div key={log.id} className="card p-4">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="font-display text-base font-black text-ink">{log.topic}</p>
                    <p className="text-xs font-bold text-ink-soft">
                      {new Date(log.date).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
                    </p>
                  </div>
                  <p className="text-sm leading-relaxed text-ink-soft">{log.report}</p>
                </div>
              ))}
            />
          </div>
          <LessonLogForm
            studentId={student.id}
            defaultDate={logPrefill?.date}
            defaultTopic={logPrefill?.topic}
            autoFocus={!!logPrefill}
          />
        </CollapsibleSection>
        </div>
        </div>
        </div>
        </>)}


      </main>
    </TeacherShell>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-4 py-3 text-center">
      <p className="font-mono text-lg font-semibold leading-none text-ink">{value}</p>
      <p className="mt-1 text-[11px] text-ink-soft">{label}</p>
    </div>
  );
}
