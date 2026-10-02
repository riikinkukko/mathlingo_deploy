import { getSessionUser } from "@/lib/auth";
import { getStudentsOfTeacher, getTeacherHomeStats, isTeacherEffectivelyPro, getPendingReviewsForTeacher, getStudentBalances, getLatestMockScoresForTeacher, getUnmarkedPastLessons, getTodayLessonsForTeacher, getScheduledLessonById, getOpenQuestionsCount } from "@/lib/queries";
import { pluralRu } from "@/lib/pluralize";
import { nudgedRecently } from "@/lib/nudge";
import TeacherShell from "@/components/TeacherShell";
import TeacherDayPanel, { DayPanelData } from "@/components/TeacherDayPanel";
import VerifyEmailReminder from "@/components/VerifyEmailReminder";
import TeacherTodayCard from "@/components/TeacherTodayCard";
import LessonDoneBanner from "@/components/LessonDoneBanner";

const FREE_STUDENT_LIMIT = 3;
// Через сколько дней без активности ученик считается "потерявшимся".
const INACTIVE_DAYS = 3;

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 3600 * 1000));
}

export default async function TeacherDashboard({ searchParams }: { searchParams: { done?: string } }) {
  const user = (await getSessionUser())!;
  // ?done=<id> — только что нажали «Было» в карточке «Сегодня»: предлагаем отчёт.
  const doneLesson = searchParams.done ? await getScheduledLessonById(searchParams.done) : undefined;
  const showDone = doneLesson && doneLesson.teacherId === user.id && doneLesson.status === "done";
  const students = await getStudentsOfTeacher(user.id);
  const isOwner = !!user.isPlatformOwner;
  const isPro = isTeacherEffectivelyPro(user);

  const [homeStats, pendingReviews, balances, latestMocks, unmarked, todayLessons, openQuestions] = await Promise.all([
    getTeacherHomeStats(user.id),
    getPendingReviewsForTeacher(user.id),
    getStudentBalances(user.id),
    getLatestMockScoresForTeacher(user.id),
    getUnmarkedPastLessons(user.id),
    getTodayLessonsForTeacher(user.id),
    getOpenQuestionsCount(user.id),
  ]);
  const EMPTY = { attemptsCount: 0, solvedProblems: 0, accuracy: 0, lastActiveAt: null, pendingCount: 0, overdueCount: 0 };
  const cards = students.map((s) => {
    const st = homeStats.get(s.id) ?? EMPTY;
    return { s, stats: st, pendingCount: st.pendingCount, overdue: st.overdueCount > 0, overdueCount: st.overdueCount };
  });
  const todayLabel = new Date().toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", weekday: "short", day: "numeric", month: "long" });
  // В «Нужно внимание» — только прошлые дни: сегодняшние отмечаются в карточке «Сегодня».
  const todayIds = new Set(todayLessons.map((l) => l.id));

  // Сводка для "панели дня".
  const panelData: DayPanelData = {
    reviewsCount: pendingReviews.length,
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
      .filter((b) => b.balance < 0)
      .sort((a, b) => a.balance - b.balance)
      .map((b) => ({ id: b.studentId, name: b.studentName, lessons: -b.balance })),
    unmarkedLessons: unmarked.filter((l) => !todayIds.has(l.id)).length,
    openQuestions,
  };

  return (
    <TeacherShell active="students" title="Главная">
      <main className="mx-auto max-w-3xl px-4 pt-6">
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
        {showDone && (
          <LessonDoneBanner lesson={doneLesson} studentName={students.find((st) => st.id === doneLesson.studentId)?.name} />
        )}
        {students.length > 0 && <TeacherTodayCard lessons={todayLessons} dateLabel={todayLabel} />}
        {students.length > 0 && !user.telegramChatId && (
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
            <a href="/teacher/students/new" className="flex min-h-[48px] items-center justify-center rounded-2xl border border-line-soft bg-white text-[14px] font-extrabold text-pine-dark">
              + Ученик
            </a>
          </div>
        )}

        {!isOwner && !isPro && (
          <a
            href="/teacher/upgrade"
            className={`card mb-4 flex items-center justify-between p-3.5 transition hover:border-pine ${
              students.length >= FREE_STUDENT_LIMIT ? "border-2 !border-amber bg-amber-light/40" : ""
            }`}
          >
            <p className="text-sm font-semibold text-ink">
              Тариф: <span className="font-bold text-pine-dark">Free</span> ·{" "}
              {students.length}/{FREE_STUDENT_LIMIT} учеников
            </p>
            <span className="text-xs font-bold text-pine">Подробнее →</span>
          </a>
        )}

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

        <div className="space-y-2">
          {cards.map(({ s, stats, pendingCount, overdue }) => {
            const initials = s.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
            const debt = balances.find((b) => b.studentId === s.id && b.balance < 0);
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
                    {(s.targetScore || mock) && (
                      <span className="rounded-pill bg-paper px-2 py-0.5 text-[11px] font-black text-ink-soft" title="Последний пробник / цель">
                        {mock ?? "—"} / {s.targetScore ?? "—"}
                      </span>
                    )}
                    {debt && (
                      <span className="rounded-pill bg-coral-light px-2 py-0.5 text-[11px] font-black text-coral-text">
                        долг {-debt.balance}
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
      </main>
    </TeacherShell>
  );
}
