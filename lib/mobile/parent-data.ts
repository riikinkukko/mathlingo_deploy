/**
 * Кабинет родителя в приложении (/api/m/parent). Те же данные, что на
 * /parent и /parent/child/[id]: комментарии к пробникам родителю не отдаём,
 * баланс — только если репетитор включил напоминания об оплате.
 */
import {
  computeOverallStats,
  computeStudentProgress,
  getChildrenOfParent,
  getCurriculum,
  getHomeworksForStudent,
  getLessonLogsForStudent,
  getMockScores,
  getStudentBalance,
  getUpcomingLessonsForStudent,
  getUserById,
  getWeeklyStats,
  homeworkStatus,
  isParentOf,
} from "@/lib/queries";
import { formatRub, hasDebt } from "@/lib/money";
import { balanceText } from "@/components/BalanceSummary";
import { pluralRu } from "@/lib/pluralize";
import type { User } from "@/lib/types";
import { collapseLessons } from "./teacher-data";

export async function parentHome(parent: User) {
  const children = await getChildrenOfParent(parent.id);
  const items = await Promise.all(
    children.map(async (c) => {
      const [stats, homeworks, lessons] = await Promise.all([
        computeOverallStats(c.id),
        getHomeworksForStudent(c.id),
        getUpcomingLessonsForStudent(c.id),
      ]);
      const st = await Promise.all(homeworks.map((h) => homeworkStatus(h, c.id)));
      return {
        id: c.id,
        name: c.name,
        solved: stats.solvedProblems,
        accuracy: stats.accuracy,
        activeDays7: stats.activeDaysLast7,
        hwOpen: st.filter((s) => !s.complete).length,
        hwOverdue: st.filter((s) => !s.complete && s.overdue).length,
        nextLesson: lessons[0] ? { startsAt: lessons[0].startsAt, durationMin: lessons[0].durationMin } : null,
      };
    })
  );
  return {
    name: parent.name,
    children: items,
    telegram: !!parent.telegramChatId,
    weeklyReport: parent.tgWeeklyReport !== false,
  };
}

export async function parentChild(parent: User, childId: string) {
  if (!(await isParentOf(parent.id, childId))) return null;
  const child = await getUserById(childId);
  if (!child) return null;
  const [curriculum, progress, stats, homeworks, logs, mocks, weekly, upcoming] = await Promise.all([
    getCurriculum(),
    computeStudentProgress(child.id),
    computeOverallStats(child.id),
    getHomeworksForStudent(child.id),
    getLessonLogsForStudent(child.id),
    getMockScores(child.id),
    getWeeklyStats(child.id, 12),
    getUpcomingLessonsForStudent(child.id),
  ]);
  const teacher = child.teacherId ? await getUserById(child.teacherId) : undefined;
  const statuses = await Promise.all(homeworks.map((h) => homeworkStatus(h, child.id)));
  const balance =
    child.paymentRemindersEnabled && child.teacherId ? await getStudentBalance(child.teacherId, child.id) : undefined;

  let balanceView: { title: string; sub: string; debt: boolean } | null = null;
  if (balance) {
    const debt = hasDebt(balance);
    const title =
      debt && balance.balanceRub !== null
        ? `Долг ${formatRub(-balance.balanceRub)}${balance.balance < 0 ? ` (${-balance.balance} ${pluralRu(-balance.balance, ["занятие", "занятия", "занятий"])})` : ""}`
        : balanceText(balance).replace(/^\S/, (c) => c.toUpperCase());
    balanceView = {
      title,
      sub: teacher?.paymentInstructions ? `Как оплатить: ${teacher.paymentInstructions}` : `Оплачено ${balance.paidLessons} · проведено ${balance.doneLessons}`,
      debt,
    };
  }

  const topics = curriculum.map((e) => {
    const skills = e.chapters.flatMap((c) => c.skills);
    const solved = skills.reduce((s, k) => s + (progress[k.id]?.solved ?? 0), 0);
    const total = skills.reduce((s, k) => s + (progress[k.id]?.total ?? 0), 0);
    return { id: e.topic.id, title: e.topic.title, solved, total };
  });

  return {
    child: { id: child.id, name: child.name, targetScore: child.targetScore ?? null },
    teacher: teacher ? { name: teacher.name } : null,
    stats: { solved: stats.solvedProblems, accuracy: stats.accuracy, activeDays7: stats.activeDaysLast7 },
    weekly: weekly.map((w) => ({ week: w.week, solved: w.solved, accuracy: w.accuracy })),
    // Комментарии к пробникам репетитор пишет для себя — родителю только балл и дата.
    mocks: mocks.map((m) => ({ id: m.id, score: m.score, takenAt: m.takenAt })),
    upcoming: collapseLessons(upcoming.slice(0, 5).map((l) => ({ ...l, studentName: child.name }))).map((l) => ({
      id: l.id,
      startsAt: l.startsAt,
      durationMin: l.durationMin,
      topic: l.topic,
      group: l.groupLessonId ? l.title : null,
    })),
    homeworks: homeworks
      .map((h, i) => ({
        id: h.id,
        title: h.title,
        kind: h.kind,
        dueDate: h.dueDate,
        done: statuses[i].done,
        total: statuses[i].total,
        overdue: statuses[i].overdue,
        complete: statuses[i].complete,
      }))
      .sort((a, b) => b.dueDate.localeCompare(a.dueDate)),
    logs: logs.slice(0, 30).map((l) => ({ id: l.id, date: l.date, topic: l.topic, report: l.report })),
    balance: balanceView,
    topics,
  };
}
