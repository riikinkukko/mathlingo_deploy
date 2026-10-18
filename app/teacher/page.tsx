import { getSessionUser } from "@/lib/auth";
import { getStudentsOfTeacher, getTeacherHomeStats, getTeacherSetupProgress, isTeacherEffectivelyPro, getPendingReviewsForTeacher, getStudentBalances, getLatestMockScoresForTeacher, getUnmarkedPastLessons, getTodayLessonsForTeacher, getScheduledLessonById, getOpenQuestionsCount } from "@/lib/queries";
import { pluralRu } from "@/lib/pluralize";
import { nudgedRecently } from "@/lib/nudge";
import TeacherShell from "@/components/TeacherShell";
import TeacherDayPanel, { DayPanelData } from "@/components/TeacherDayPanel";
import VerifyEmailReminder from "@/components/VerifyEmailReminder";
import TeacherTodayCard from "@/components/TeacherTodayCard";
import LessonDoneBanner from "@/components/LessonDoneBanner";
import TeacherSetupChecklist from "@/components/TeacherSetupChecklist";
import { countDistinctLessons, getGroupsOfTeacher } from "@/lib/groups";
import { debtText, hasDebt } from "@/lib/money";
import { teacherPlanState, TEACHER_TIERS } from "@/lib/teacher-plan";
import { countPaidChecksWaiting, isReviewer } from "@/lib/paid-review";
import { getPendingInvitesForTeacher } from "@/lib/teacher-invites";
import { cancelTeacherInviteAction } from "@/app/actions";
import StudentTable, { StudentTableRow, PendingInviteRow } from "@/components/teacher/StudentTable";

// Через сколько дней без активности ученик считается "потерявшимся".
const INACTIVE_DAYS = 3;

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 3600 * 1000));
}

export default async function TeacherDashboard(props: { searchParams: Promise<{ done?: string }> }) {
  const searchParams = await props.searchParams;
  const user = (await getSessionUser())!;
  // ?done=<id> — только что нажали «Было» в карточке «Сегодня»: предлагаем отчёт.
  const doneLesson = searchParams.done ? await getScheduledLessonById(searchParams.done) : undefined;
  const showDone = doneLesson && doneLesson.teacherId === user.id && doneLesson.status === "done";
  const students = await getStudentsOfTeacher(user.id);
  const isOwner = !!user.isPlatformOwner;
  const isPro = isTeacherEffectivelyPro(user);
  const plan = teacherPlanState(user);
  const paidChecks = isReviewer(user) ? await countPaidChecksWaiting() : 0;
  const atLimit = !isOwner && Number.isFinite(plan.limit) && students.length >= plan.limit;

  const [homeStats, pendingReviews, balances, latestMocks, unmarked, todayLessons, openQuestions, setup, groups, invitesRaw] = await Promise.all([
    getTeacherHomeStats(user.id),
    getPendingReviewsForTeacher(user.id),
    getStudentBalances(user.id),
    getLatestMockScoresForTeacher(user.id),
    getUnmarkedPastLessons(user.id),
    getTodayLessonsForTeacher(user.id),
    getOpenQuestionsCount(user.id),
    getTeacherSetupProgress(user.id),
    getGroupsOfTeacher(user.id),
    getPendingInvitesForTeacher(user.id),
  ]);
  const groupsByStudent = new Map<string, string[]>();
  for (const g of groups) for (const m of g.members) groupsByStudent.set(m.id, [...(groupsByStudent.get(m.id) ?? []), g.name]);
  const setupVisible = !(students.length > 0 && setup.homeworks > 0 && setup.lessons > 0);
  const EMPTY = { attemptsCount: 0, solvedProblems: 0, accuracy: 0, lastActiveAt: null, pendingCount: 0, overdueCount: 0 };
  const cards = students.map((s) => {
    const st = homeStats.get(s.id) ?? EMPTY;
    return { s, stats: st, pendingCount: st.pendingCount, overdue: st.overdueCount > 0, overdueCount: st.overdueCount };
  });
  const todayLabel = new Date().toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", weekday: "short", day: "numeric", month: "long" });
  // В «Нужно внимание» — только прошлые дни: сегодняшние отмечаются в карточке «Сегодня».
  const todayIds = new Set(todayLessons.map((l) => l.id));

  // Работы на проверке по ученикам — для строки «Проверить работу» и бейджей в списке.
  const reviewsByStudent = new Map<string, number>();
  for (const r of pendingReviews) reviewsByStudent.set(r.student.id, (reviewsByStudent.get(r.student.id) ?? 0) + 1);
  const reviewStudents = students
    .filter((s) => reviewsByStudent.has(s.id))
    .map((s) => ({ id: s.id, name: s.name, count: reviewsByStudent.get(s.id)! }))
    .sort((a, b) => b.count - a.count);

  // Сводка для "панели дня".
  const panelData: DayPanelData = {
    reviewsCount: pendingReviews.length,
    reviewStudents,
    overdue: cards
      .filter((c) => c.overdueCount > 0)
      .map((c) => ({ id: c.s.id, name: c.s.name, count: c.overdueCount })),
    inactive: cards
      .map((c) => {
        // сколько дней назад заходил; если ни разу — считаем от создания аккаунта
        const ref = c.stats.lastActiveAt ?? c.s.createdAt;
        const days = c.stats.lastActiveAt ? daysSince(c.stats.lastActiveAt) : null;
        const idleDays = daysSince(ref);
        return { id: c.s.id, name: c.s.name, days, idleDays, nudged: nudgedRecently(c.s.nudgedAt) };
      })
      .filter((x) => x.idleDays >= INACTIVE_DAYS)
      .sort((a, b) => b.idleDays - a.idleDays)
      .map(({ id, name, days, nudged }) => ({ id, name, days, nudged })),
    debts: balances
      .filter(hasDebt)
      .sort((a, b) => a.balance - b.balance)
      .map((b) => ({ id: b.studentId, name: b.studentName, lessons: -b.balance, label: debtText(b) })),
    unmarkedLessons: countDistinctLessons(unmarked.filter((l) => !todayIds.has(l.id))),
    openQuestions,
  };

  // Таблица учеников (десктоп): всё считаем здесь, клиент только сортирует и фильтрует.
  const lastLabel = (iso: string | null) => {
    if (!iso) return "не заходил(а)";
    const d = daysSince(iso);
    return d <= 0 ? "сегодня" : d === 1 ? "вчера" : `${d} дн. назад`;
  };
  const tableRows: StudentTableRow[] = cards.map(({ s, stats }) => {
    const debt = balances.find((b) => b.studentId === s.id && hasDebt(b));
    const st = stats as typeof stats & { solvedWeek?: number; accuracyWeek?: number | null; hwTotal?: number };
    return {
      id: s.id,
      name: s.name,
      grade: s.grade ?? null,
      targetScore: s.targetScore ?? null,
      lastActiveMs: stats.lastActiveAt ? new Date(stats.lastActiveAt).getTime() : 0,
      lastLabel: lastLabel(stats.lastActiveAt),
      idle: daysSince(stats.lastActiveAt ?? s.createdAt) >= INACTIVE_DAYS,
      solvedWeek: st.solvedWeek ?? 0,
      accuracyWeek: st.accuracyWeek ?? null,
      pendingReviews: reviewsByStudent.get(s.id) ?? 0,
      hwOpen: stats.pendingCount,
      hwOverdue: stats.overdueCount,
      hwTotal: st.hwTotal ?? 0,
      mock: latestMocks.get(s.id) ?? null,
      groups: groupsByStudent.get(s.id) ?? [],
      debtLabel: debt ? debtText(debt) : null,
    };
  });
  const invites: PendingInviteRow[] = invitesRaw.map((inv) => ({
    id: inv.id,
    name: inv.studentName,
    email: inv.studentEmail,
    sentLabel: new Date(inv.createdAt).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "long" }),
  }));

  const groupsCard = (extra: string) =>
    students.length >= 2 && (
      <a
        href="/teacher/groups"
        className={`mb-3 items-center gap-3 rounded-[20px] border border-violet-border bg-violet-light/50 p-3.5 transition hover:border-violet ${extra}`}
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-white text-[20px]" aria-hidden>
          👥
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[15px] font-black text-ink">
            {groups.length ? `Группы · ${groups.length}` : "Группы"}
          </span>
          <span className="block truncate text-[12px] text-ink-soft">
            {groups.length ? groups.map((g) => g.name).join(", ") : "Занятия и домашка сразу для нескольких учеников"}
          </span>
        </span>
        <span className="font-black text-violet">›</span>
      </a>
    );

  return (
    <TeacherShell active="students" title="Мои ученики">
      {/* Телефон: одна колонка, порядок как раньше (A → B → C).
          lg: таблица вместо карточек и сразу под заголовком (A → C → B, B — в две колонки);
          от 1400px: справа колонка «Сегодня / Нужно внимание / быстрые действия» (B),
          слева A и таблица. */}
      <main className="mx-auto max-w-3xl px-4 pt-6 lg:flex lg:max-w-[1320px] lg:flex-col lg:pb-8 min-[1400px]:grid min-[1400px]:grid-cols-[minmax(0,1fr)_340px] min-[1400px]:grid-rows-[auto_1fr] min-[1400px]:items-start min-[1400px]:gap-x-6">
        <div className="lg:order-1 min-[1400px]:col-start-1 min-[1400px]:row-start-1">
          {!user.emailVerifiedAt && (
            <div className="mb-4">
              <VerifyEmailReminder
                compact
                reason={
                  !isOwner && !isPro
                    ? "Подтвердите email — без этого нельзя добавлять учеников"
                    : undefined
                }
              />
            </div>
          )}
          {paidChecks > 0 && (
            <a href="/teacher/checks" className="card mb-4 flex items-center justify-between gap-3 border-2 !border-violet/40 p-3.5 transition hover:!border-violet">
              <p className="text-sm font-bold text-ink">
                Платные проверки: {paidChecks} {pluralRu(paidChecks, ["решение ждёт", "решения ждут", "решений ждут"])} эксперта
              </p>
              <span className="shrink-0 text-xs font-bold text-violet">Проверить</span>
            </a>
          )}
          {showDone && (
            <LessonDoneBanner lesson={doneLesson} studentName={students.find((st) => st.id === doneLesson.studentId)?.name} />
          )}
          <TeacherSetupChecklist
            emailVerified={!!user.emailVerifiedAt || isOwner || isPro}
            studentsCount={students.length}
            homeworks={setup.homeworks}
            lessons={setup.lessons}
            telegram={!!user.telegramChatId}
            firstStudentId={students[0]?.id}
          />
        </div>

        <aside className="lg:order-3 lg:mt-8 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-4 min-[1400px]:col-start-2 min-[1400px]:row-span-2 min-[1400px]:row-start-1 min-[1400px]:mt-0 min-[1400px]:block" aria-label="Сегодня и важное">
          {students.length > 0 && <TeacherTodayCard lessons={todayLessons} dateLabel={todayLabel} />}
          {students.length > 0 && !user.telegramChatId && !setupVisible && (
            <a
              href="/teacher/settings#telegram"
              className="mb-4 flex items-center gap-3 rounded-2xl border border-line-soft bg-white px-4 py-3 text-sm transition hover:border-pine"
            >
              <span className="flex-1">
                <span className="block font-bold text-ink">Подключите Telegram</span>
                <span className="block text-xs text-ink-soft">
                  Бот сообщит о сданной домашке и даст отметить занятие «было / не было» прямо из чата.
                </span>
              </span>
              <span className="font-black text-pine-dark">→</span>
            </a>
          )}
          {students.length > 0 && <TeacherDayPanel data={panelData} />}
          {students.length > 0 && (
            <div className="mb-6 grid grid-cols-3 gap-2">
              <a href="/teacher/schedule" className="flex min-h-[48px] items-center justify-center rounded-2xl border border-line-soft bg-white text-[14px] font-extrabold text-pine-dark">
                + Занятие
              </a>
              <a href="/teacher/payments" className="flex min-h-[48px] items-center justify-center rounded-2xl border border-line-soft bg-white text-[14px] font-extrabold text-pine-dark">
                + Оплата
              </a>
              {/* При исчерпанном лимите тарифа показываем это прямо на кнопке. */}
              {atLimit ? (
                <a
                  href="/teacher/students/new"
                  title="Лимит учеников на текущем тарифе"
                  className="flex min-h-[48px] items-center justify-center gap-1 rounded-2xl border border-line-soft bg-white text-[14px] font-extrabold text-ink-soft"
                >
                  <span aria-hidden>🔒</span> Ученик {students.length}/{plan.limit}
                </a>
              ) : (
                <a href="/teacher/students/new" className="flex min-h-[48px] items-center justify-center rounded-2xl border border-line-soft bg-white text-[14px] font-extrabold text-pine-dark">
                  + Ученик
                </a>
              )}
            </div>
          )}

          {!isOwner && (plan.source !== "paid" || Number.isFinite(plan.limit)) && (
            <a
              href="/teacher/upgrade"
              className={`card mb-4 flex items-center justify-between gap-3 p-3.5 transition hover:border-pine ${
                students.length >= plan.limit || (plan.trialDaysLeft !== null && plan.trialDaysLeft <= 3)
                  ? "border-2 !border-amber bg-amber-light/40"
                  : ""
              }`}
            >
              <p className="text-sm font-semibold text-ink">
                {plan.source === "trial" ? (
                  <>
                    Пробный <span className="font-bold text-pine-dark">«Профи»</span> · осталось {plan.trialDaysLeft}{" "}
                    {pluralRu(plan.trialDaysLeft ?? 0, ["день", "дня", "дней"])}
                  </>
                ) : (
                  <>
                    Тариф: <span className="font-bold text-pine-dark">{plan.tier === "free" ? "Бесплатный" : TEACHER_TIERS[plan.tier].name}</span> ·{" "}
                    {students.length}/{plan.limit} учеников
                  </>
                )}
              </p>
              <span className="shrink-0 text-xs font-bold text-pine">{plan.source === "trial" ? "Тарифы →" : "Подробнее →"}</span>
            </a>
          )}

          {!isOwner && students.length > 0 && (
            <a href="/teacher/upgrade#invite" className="mb-4 -mt-2 block px-1 text-[13px] font-bold text-pine-dark hover:underline">
              Пригласите коллегу — +30 дней тарифа вам обоим
            </a>
          )}

          {groupsCard("hidden min-[1400px]:flex")}
        </aside>

        <section className="min-w-0 lg:order-2 min-[1400px]:col-start-1 min-[1400px]:row-start-2">
          <div id="students" className="mb-4 flex scroll-mt-24 flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-black text-ink">Мои ученики</h1>
              <p className="mt-1 text-sm text-ink-soft">
                {students.length} {pluralRu(students.length, ["ученик", "ученика", "учеников"])}
              </p>
            </div>
            {/* «+ Ученик» уже есть в быстрых кнопках выше, «Контент» — в боковом меню:
                кнопки здесь нужны только пока учеников нет. */}
            <div className={`gap-2 ${students.length > 0 ? "hidden" : "flex"}`}>
              {(isOwner || user.isAdmin) && (
                <a href="/teacher/content" className="btn-secondary">
                  Контент программы
                </a>
              )}
              <a href="/teacher/students/new" className="btn-primary">
                + Добавить ученика
              </a>
            </div>
          </div>

          {groupsCard("flex min-[1400px]:hidden")}

          {invites.length > 0 && (
            <div className="mb-3 space-y-2 lg:hidden">
              {invites.map((inv) => (
                <div key={inv.id} className="flex items-center gap-3 rounded-[20px] border border-dashed border-line bg-white p-3.5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-amber-light text-[18px]" aria-hidden>
                    ✉
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-[15px] font-black text-ink">{inv.name}</span>
                    <span className="block truncate text-[12px] text-ink-soft">Приглашение отправлено {inv.sentLabel} · ждём ответа</span>
                  </span>
                  <form action={cancelTeacherInviteAction}>
                    <input type="hidden" name="inviteId" value={inv.id} />
                    <button type="submit" className="min-h-[44px] px-1 text-[12px] font-bold text-ink-soft hover:text-coral-text">
                      Отозвать
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}

          {students.length === 0 && invites.length === 0 && (
            <div className="card hidden p-8 text-center text-sm text-ink-soft lg:block">
              Пока нет учеников. Нажмите «Добавить ученика», чтобы создать первый аккаунт или пригласить уже зарегистрированного ученика.
            </div>
          )}
          {(students.length > 0 || invites.length > 0) && (
            <div className="hidden lg:block">
              <StudentTable rows={tableRows} groups={groups.map((g) => g.name)} invites={invites} cancelInvite={cancelTeacherInviteAction} />
            </div>
          )}

          <div className="space-y-2 lg:hidden">
            {cards.map(({ s, stats, pendingCount, overdue }) => {
              const initials = s.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
              const debt = balances.find((b) => b.studentId === s.id && hasDebt(b));
              const mock = latestMocks.get(s.id);
              return (
                <a
                  key={s.id}
                  href={`/teacher/student/${s.id}`}
                  className="flex items-center gap-3 rounded-[20px] border border-line-soft bg-white p-3.5 transition hover:border-pine"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-pine-light font-display text-[15px] font-black text-pine-dark">
                    {initials}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate font-display text-[15px] font-black text-ink">{s.name}</span>
                      {(reviewsByStudent.get(s.id) ?? 0) > 0 && (
                        <span className="rounded-pill bg-violet-light px-2 py-0.5 text-[11px] font-black text-violet-text">
                          на проверке {reviewsByStudent.get(s.id)}
                        </span>
                      )}
                      {(s.targetScore || mock) && (
                        <span className="rounded-pill bg-paper px-2 py-0.5 text-[11px] font-black text-ink-soft" title="Последний пробник / цель">
                          {mock ? `пробник ${mock}` : "пробника нет"}
                          {s.targetScore ? ` · цель ${s.targetScore}` : ""}
                        </span>
                      )}
                      {(groupsByStudent.get(s.id) ?? []).slice(0, 2).map((gn) => (
                        <span key={gn} className="max-w-[120px] truncate rounded-pill bg-violet-light px-2 py-0.5 text-[11px] font-black text-violet">
                          {gn}
                        </span>
                      ))}
                      {debt && (
                        <span className="rounded-pill bg-coral-light px-2 py-0.5 text-[11px] font-black text-coral-text">
                          долг {debtText(debt)}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-[12px] leading-snug text-ink-soft">
                      {stats.attemptsCount > 0
                        ? `решено ${stats.solvedProblems} · точность ${stats.accuracy}% · `
                        : "ещё не начинал(а) · "}
                      <span className={overdue ? "font-bold text-coral-text" : ""}>
                        ДЗ {pendingCount}
                        {overdue ? ", есть просроченное" : ""}
                      </span>
                    </span>
                  </span>
                  <span aria-hidden className="text-lg font-black text-ink-soft/60">›</span>
                </a>
              );
            })}
            {students.length === 0 && (
              <div className="card p-8 text-center text-sm text-ink-soft">
                Пока нет учеников. Нажмите «Добавить ученика», чтобы создать первый аккаунт.
              </div>
            )}
          </div>
        </section>
      </main>
    </TeacherShell>
  );
}
