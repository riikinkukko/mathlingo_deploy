import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import {
  getCurriculum,
  computeStudentProgress,
  computeOverallStats,
  getHomeworksForStudent,
  homeworkStatus,
  getUserById,
  getLessonLogsForStudent,
  isParentOf,
  getMockScores,
  getWeeklyStats,
  getUpcomingLessonsForStudent,
  getStudentBalance,
} from "@/lib/queries";
import { balanceLabel } from "@/components/BalanceSummary";
import { IconCalendar, IconClipboard } from "@/components/icons";
import GoalCard from "@/components/GoalCard";
import UpcomingLessons from "@/components/UpcomingLessons";
import { lessonWhenLabel } from "@/lib/lesson-time";
import StudentDynamicsSection from "@/components/StudentDynamicsSection";
import ParentShell from "@/components/ParentShell";
import GradeBadge from "@/components/GradeBadge";
import CollapsibleSection from "@/components/CollapsibleSection";
import SkillsProgressSummary from "@/components/SkillsProgressSummary";
import RecentList from "@/components/RecentList";
import { pluralRu } from "@/lib/pluralize";
import Mascot from "@/components/Mascot";
import TelegramConnectCard from "@/components/TelegramConnectCard";
import ParentWeeklyToggle from "@/components/ParentWeeklyToggle";

const KIND_LABEL: Record<string, string> = {
  homework: "Домашка",
  test: "Контрольная",
  exam: "Пробник",
};

export default async function ChildDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { telegram?: string };
}) {
  const parent = (await getSessionUser())!;
  const isMyChild = await isParentOf(parent.id, params.id);
  const child = await getUserById(params.id);
  if (!child || !isMyChild) notFound();

  const curriculum = await getCurriculum();
  const progress = await computeStudentProgress(child.id);
  const stats = await computeOverallStats(child.id);
  const homeworks = await getHomeworksForStudent(child.id);
  const lessonLogs = await getLessonLogsForStudent(child.id);
  const teacher = child.teacherId ? await getUserById(child.teacherId) : undefined;
  const homeworkStatuses = await Promise.all(
    homeworks.map(async (hw) => [hw.id, await homeworkStatus(hw, child.id)] as const)
  );
  const statusById = new Map(homeworkStatuses);

  const [mocksRaw, weekly, upcomingLessons] = await Promise.all([
    getMockScores(child.id),
    getWeeklyStats(child.id, 12),
    getUpcomingLessonsForStudent(child.id),
  ]);
  // Комментарии к пробникам репетитор пишет для себя — родителю отдаём только
  // балл и дату. Обнуляем сразу, чтобы текст не попал ни в HTML, ни в данные.
  const mocks = mocksRaw.map((m) => ({ ...m, note: null }));
  const solved12w = weekly.reduce((sum, w) => sum + w.solved, 0);
  // Баланс оплат показываем родителю, только если репетитор сам включил для
  // этого ученика напоминания об оплате (значит, ведёт оплаты в приложении).
  const balance =
    child.paymentRemindersEnabled && child.teacherId
      ? await getStudentBalance(child.teacherId, child.id)
      : undefined;

  const thisWeek = weekly[weekly.length - 1] ?? { solved: 0, accuracy: null };
  const hwDone = homeworks.filter((h) => statusById.get(h.id)?.complete).length;
  const hwOverdue = homeworks.filter((h) => statusById.get(h.id)?.overdue).length;
  const nextDue = homeworks
    .filter((h) => !statusById.get(h.id)?.complete && new Date(h.dueDate).getTime() >= Date.now())
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];

  return (
    <ParentShell title={child.name}>
      <main className="mx-auto max-w-3xl px-4 py-5">
        {/* Неделя ребёнка — главное, ради чего родитель открывает приложение. */}
        <section className="mb-4 flex items-center gap-3 rounded-[24px] bg-pine-darker p-4 pl-5 text-white">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-extrabold text-pine-mint">
              {child.name.split(" ")[0]} · эта неделя
            </p>
            <p className="mt-1 font-display text-[22px] font-black leading-tight">
              {stats.activeDaysLast7 > 0
                ? `Занятия ${stats.activeDaysLast7} ${pluralRu(stats.activeDaysLast7, ["день", "дня", "дней"])} из 7`
                : "Неделя без занятий"}
            </p>
            <p className="mt-1.5 text-[14px] text-pine-mint">
              {thisWeek.solved} {pluralRu(thisWeek.solved, ["задача", "задачи", "задач"])}
              {thisWeek.accuracy !== null ? ` · точность ${thisWeek.accuracy}%` : ""}
            </p>
          </div>
          <Mascot mood={stats.activeDaysLast7 >= 3 ? "happy" : stats.activeDaysLast7 > 0 ? "idle" : "worried"} size={80} float={false} />
        </section>

        <GoalCard targetScore={child.targetScore} mocks={mocks} readOnly />
        {!child.targetScore && mocks.length === 0 && <div className="mb-4" />}

        {/* Сводка одной карточкой: занятие, домашка, оплата. */}
        <section className="mb-4 overflow-hidden rounded-[20px] border border-line-soft bg-white">
          <SummaryRow
            tone="bg-pine-light text-pine-dark"
            icon={<IconCalendar className="h-5 w-5" />}
            title={
              upcomingLessons[0]
                ? `Занятие: ${lessonWhenLabel(upcomingLessons[0].startsAt, upcomingLessons[0].durationMin).replace(/^\S/, (c) => c.toLowerCase())}`
                : "Ближайших занятий нет"
            }
            sub={
              upcomingLessons[0]
                ? [
                    upcomingLessons[0].groupLessonId
                      ? upcomingLessons[0].groupName
                        ? `группа «${upcomingLessons[0].groupName}»`
                        : "групповое занятие"
                      : null,
                    upcomingLessons[0].topic,
                  ]
                    .filter(Boolean)
                    .join(" · ") || (teacher ? `Репетитор: ${teacher.name}` : undefined)
                : teacher
                  ? `Репетитор: ${teacher.name}`
                  : undefined
            }
          />
          <SummaryRow
            tone="bg-amber-light text-amber-dark"
            icon={<IconClipboard className="h-5 w-5" />}
            title={
              homeworks.length === 0
                ? "Домашних заданий нет"
                : `Домашка: ${hwDone} из ${homeworks.length} ${pluralRu(homeworks.length, ["сдана", "сданы", "сдано"])}`
            }
            sub={
              hwOverdue > 0
                ? `Просрочено: ${hwOverdue}`
                : nextDue
                  ? `Ближайший срок — ${new Date(nextDue.dueDate).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "long" })}`
                  : undefined
            }
            alert={hwOverdue > 0}
          />
          {balance && (
            <SummaryRow
              tone={balance.balance < 0 ? "bg-coral-light text-coral-text" : "bg-pine-light text-pine-dark"}
              icon="₽"
              title={balanceLabel(balance.balance)}
              sub={teacher?.paymentInstructions ? `Как оплатить: ${teacher.paymentInstructions}` : `Оплачено ${balance.paidLessons} · проведено ${balance.doneLessons}`}
              alert={balance.balance < 0}
              last
            />
          )}
        </section>

        {lessonLogs[0] && (
          <section className="mb-6 rounded-[20px] border border-line-soft bg-white p-4">
            <p className="text-[12px] font-extrabold text-ink-soft">
              Последний отчёт репетитора ·{" "}
              {new Date(lessonLogs[0].date).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
            </p>
            <p className="mt-1 font-display text-[15px] font-black text-ink">{lessonLogs[0].topic}</p>
            <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">{lessonLogs[0].report}</p>
          </section>
        )}

        <h2 className="mb-2 px-1 text-[12px] font-black uppercase tracking-wide text-ink-soft">Подробнее</h2>

        {upcomingLessons.length > 0 && (
          <CollapsibleSection
            title="Ближайшие занятия"
            summary={`${upcomingLessons.length} ${pluralRu(upcomingLessons.length, ["занятие", "занятия", "занятий"])}`}
            defaultOpen
          >
            <UpcomingLessons lessons={upcomingLessons} showStudent={false} from="student" readOnly limit={5} />
          </CollapsibleSection>
        )}

        <CollapsibleSection
          title="Динамика"
          summary={`${solved12w} ${pluralRu(solved12w, ["задача", "задачи", "задач"])} за 12 недель`}
        >
          <StudentDynamicsSection weekly={weekly} mocks={mocks} targetScore={child.targetScore} readOnly />
        </CollapsibleSection>

        <CollapsibleSection
          title="Журнал занятий"
          summary={lessonLogs.length > 0 ? `${lessonLogs.length} ${pluralRu(lessonLogs.length, ["запись", "записи", "записей"])}` : undefined}
        >
          <RecentList
            limit={4}
            emptyText="Репетитор пока не оставил записей о занятиях."
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
        </CollapsibleSection>

        <CollapsibleSection
          title="Прогресс по навыкам"
          summary={`${stats.solvedProblems}/${stats.totalProblems} задач`}
        >
          <SkillsProgressSummary curriculum={curriculum} progress={progress} />
        </CollapsibleSection>

        <CollapsibleSection
          title="Задания"
          summary={homeworks.length > 0 ? `${homeworks.length} ${pluralRu(homeworks.length, ["задание", "задания", "заданий"])}` : undefined}
          defaultOpen
        >
          <RecentList
            limit={4}
            emptyText="Пока нет назначенных заданий."
            items={homeworks.map((hw) => {
              const st = statusById.get(hw.id)!;
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
                      {st.complete && <span className="ml-2 text-pine">выполнено</span>}
                    </p>
                  </div>
                  <GradeBadge solved={st.done} total={st.total} size="sm" showFraction />
                </div>
              );
            })}
          />
        </CollapsibleSection>
        <div className="mt-6">
          <TelegramConnectCard
            user={parent}
            returnTo={`/parent/child/${child.id}`}
            disconnected={searchParams.telegram === "disconnected"}
            pitch="Напоминания о занятиях, отчёты репетитора после урока и напоминания об оплате — прямо в Telegram, без входа в приложение."
            connectedNote="Уведомления о ребёнке дублируются сюда."
          />
          {/* Отчёт приходит в приложение всегда, в Telegram — если подключён. */}
          <ParentWeeklyToggle enabled={parent.tgWeeklyReport !== false} />
        </div>
      </main>
    </ParentShell>
  );
}

function SummaryRow({
  icon,
  tone,
  title,
  sub,
  alert,
  last,
}: {
  icon: React.ReactNode;
  tone: string;
  title: string;
  sub?: string;
  alert?: boolean;
  last?: boolean;
}) {
  return (
    <div className={`flex min-h-[60px] items-center gap-3 px-4 py-2.5 ${last ? "" : "border-b border-line-soft"}`}>
      <span aria-hidden className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[15px] font-black ${tone}`}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-[15px] font-extrabold ${alert ? "text-coral-text" : "text-ink"}`}>{title}</p>
        {sub && <p className="text-[12px] text-ink-soft">{sub}</p>}
      </div>
    </div>
  );
}
