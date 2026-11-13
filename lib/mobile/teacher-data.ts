/**
 * Данные экранов репетитора в приложении (/api/m/teacher/*). Те же запросы,
 * что и у страниц /teacher/* на сайте, но в виде JSON и только нужные поля
 * (полный профиль ученика с хешем пароля в ответ не попадает).
 */
import {
  computeOverallStats,
  getCurriculum,
  getHomeworksForStudent,
  getIncomeBetween,
  getLatestMockScoresForTeacher,
  getLessonLogsForStudent,
  getLessonsForTeacherRange,
  getMockScores,
  getOpenQuestionsCount,
  getParentsOfStudent,
  getPendingReviewsForTeacher,
  getProblemsForSkill,
  getQuestionsForTeacher,
  getRecentPaymentsForTeacher,
  getStudentBalance,
  getStudentBalances,
  getStudentNotes,
  getStudentPayments,
  getStudentsOfTeacher,
  getTeacherHomeStats,
  getTodayLessonsForTeacher,
  getUnmarkedPastLessons,
  getUpcomingLessonsForStudent,
  getUpcomingLessonsForTeacher,
  getUserById,
  homeworkStatus,
} from "@/lib/queries";
import { getGroupForTeacher, getGroupHomeworkBatches, getGroupLessons, getGroupsOfTeacher } from "@/lib/groups";
import { getPendingInvitesForTeacher } from "@/lib/teacher-invites";
import { listTemplates } from "@/lib/templates";
import { availableExamNumbers, weakSpotsSummary } from "@/lib/quick-homework";
import { nudgedRecently } from "@/lib/nudge";
import { currentMonthRangeMsk, debtText, hasDebt } from "@/lib/money";
import { teacherPlanState, TEACHER_TIERS } from "@/lib/teacher-plan";
import { addDaysKey, mondayOf, mskDayKey, mskDayStart } from "@/lib/lesson-time";
import { toReviewItem } from "@/lib/review-item";
import { maxPointsForTask } from "@/lib/ege-points";
import { diagramSvg } from "./diagram-svg";
import { buildReportDraft, getUnreportedLessons } from "@/lib/lesson-report";
import type { ScheduledLessonWithStudent, StudentBalance, User } from "@/lib/types";

const INACTIVE_DAYS = 3;
const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

/** Занятие для приложения. Групповое занятие — одна запись со списком учеников. */
export interface MLesson {
  id: string;
  /** id всех строк занятия (у группового — по строке на ученика) */
  lessonIds: string[];
  groupLessonId: string | null;
  groupId: string | null;
  title: string;
  startsAt: string;
  durationMin: number;
  topic: string | null;
  status: string;
  seriesId: string | null;
  students: { id: string; name: string; lessonId: string; status: string }[];
  /** проведено, а отчёта нет (только индивидуальные) */
  needsReport: boolean;
}

export function collapseLessons(rows: ScheduledLessonWithStudent[], unreported?: Set<string>): MLesson[] {
  const out: MLesson[] = [];
  const byGroup = new Map<string, MLesson>();
  for (const l of rows) {
    const st = { id: l.studentId, name: l.studentName, lessonId: l.id, status: l.status };
    if (l.groupLessonId) {
      const g = byGroup.get(l.groupLessonId);
      if (g) {
        g.lessonIds.push(l.id);
        g.students.push(st);
        continue;
      }
    }
    const item: MLesson = {
      id: l.id,
      lessonIds: [l.id],
      groupLessonId: l.groupLessonId,
      groupId: l.groupId,
      title: l.groupLessonId ? `Группа «${l.groupName ?? "группа"}»` : l.studentName,
      startsAt: l.startsAt,
      durationMin: l.durationMin,
      topic: l.topic,
      status: l.status,
      seriesId: l.seriesId,
      students: [st],
      needsReport: !l.groupLessonId && !!unreported?.has(l.id),
    };
    out.push(item);
    if (l.groupLessonId) byGroup.set(l.groupLessonId, item);
  }
  return out;
}

function balanceView(b: StudentBalance | undefined | null) {
  if (!b) return null;
  return {
    balance: b.balance,
    balanceRub: b.balanceRub,
    priceRub: b.priceRub,
    paidLessons: b.paidLessons,
    paidRub: b.paidRub,
    chargedLessons: b.chargedLessons,
    lastPaidAt: b.lastPaidAt,
    debt: hasDebt(b) ? debtText(b) : null,
  };
}

function planView(user: User, studentsCount: number) {
  const plan = teacherPlanState(user);
  return {
    name: plan.source === "owner" ? "Владелец" : plan.tier === "free" ? "Бесплатный" : TEACHER_TIERS[plan.tier].name,
    source: plan.source,
    limit: Number.isFinite(plan.limit) ? plan.limit : null,
    trialDaysLeft: plan.trialDaysLeft,
    until: plan.until ? plan.until.toISOString() : null,
    studentsCount,
    atLimit: plan.source !== "owner" && Number.isFinite(plan.limit) && studentsCount >= plan.limit,
  };
}

/** Главная: сегодня, что требует внимания, список учеников. */
export async function teacherHome(user: User) {
  const [students, homeStats, pending, balances, mocks, unmarked, today, openQuestions, groups, invites, unreported] = await Promise.all([
    getStudentsOfTeacher(user.id),
    getTeacherHomeStats(user.id),
    getPendingReviewsForTeacher(user.id),
    getStudentBalances(user.id),
    getLatestMockScoresForTeacher(user.id),
    getUnmarkedPastLessons(user.id),
    getTodayLessonsForTeacher(user.id),
    getOpenQuestionsCount(user.id),
    getGroupsOfTeacher(user.id),
    getPendingInvitesForTeacher(user.id),
    getUnreportedLessons(user.id),
  ]);
  const unrep = new Set(unreported.map((l) => l.id));
  const reviewsBy = new Map<string, number>();
  for (const r of pending) reviewsBy.set(r.student.id, (reviewsBy.get(r.student.id) ?? 0) + 1);
  const groupsBy = new Map<string, string[]>();
  for (const g of groups) for (const m of g.members) groupsBy.set(m.id, [...(groupsBy.get(m.id) ?? []), g.name]);
  const todayIds = new Set(today.map((l) => l.id));

  const list = students
    .map((s) => {
      const st = homeStats.get(s.id);
      const b = balances.find((x) => x.studentId === s.id);
      const lastActiveAt = st?.lastActiveAt ?? null;
      return {
        id: s.id,
        name: s.name,
        grade: s.grade ?? null,
        targetScore: s.targetScore ?? null,
        lastActiveAt,
        idleDays: daysSince(lastActiveAt ?? s.createdAt),
        everActive: !!lastActiveAt,
        nudged: nudgedRecently(s.nudgedAt),
        solved: st?.solvedProblems ?? 0,
        accuracy: st?.accuracy ?? 0,
        attempts: st?.attemptsCount ?? 0,
        solvedWeek: st?.solvedWeek ?? 0,
        hwOpen: st?.pendingCount ?? 0,
        hwOverdue: st?.overdueCount ?? 0,
        reviews: reviewsBy.get(s.id) ?? 0,
        mock: mocks.get(s.id) ?? null,
        groups: groupsBy.get(s.id) ?? [],
        debt: b && hasDebt(b) ? debtText(b) : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));

  return {
    name: user.name,
    emailVerified: !!user.emailVerifiedAt,
    telegram: !!user.telegramChatId,
    plan: planView(user, students.length),
    today: collapseLessons(today, unrep),
    attention: {
      unreported: unreported.map((l) => ({ lessonId: l.id, studentId: l.studentId, name: l.studentName, startsAt: l.startsAt })),
      reviews: pending.length,
      questions: openQuestions,
      unmarked: collapseLessons(unmarked.filter((l) => !todayIds.has(l.id))),
      overdue: list.filter((s) => s.hwOverdue > 0).map((s) => ({ id: s.id, name: s.name, count: s.hwOverdue })),
      inactive: list
        .filter((s) => s.idleDays >= INACTIVE_DAYS)
        .sort((a, b) => b.idleDays - a.idleDays)
        .map((s) => ({ id: s.id, name: s.name, days: s.everActive ? s.idleDays : null, nudged: s.nudged })),
      debts: balances
        .filter(hasDebt)
        .sort((a, b) => a.balance - b.balance)
        .map((b) => ({ id: b.studentId, name: b.studentName, label: debtText(b) })),
    },
    students: list,
    groups: groups.map((g) => ({ id: g.id, name: g.name, members: g.members })),
    invites: invites.map((i) => ({ id: i.id, name: i.studentName, email: i.studentEmail, createdAt: i.createdAt })),
  };
}

/** Карточка ученика. null — не свой ученик. */
export async function teacherStudent(user: User, studentId: string) {
  const s = await getUserById(studentId);
  if (!s || s.role !== "STUDENT" || s.teacherId !== user.id) return null;
  const [stats, hwAll, logs, pending, parents, upcoming, unmarked, balance, payments, mocks, notes, weak, unreported] = await Promise.all([
    computeOverallStats(s.id),
    getHomeworksForStudent(s.id),
    getLessonLogsForStudent(s.id, user.id),
    getPendingReviewsForTeacher(user.id),
    getParentsOfStudent(s.id),
    getUpcomingLessonsForStudent(s.id, user.id),
    getUnmarkedPastLessons(user.id, s.id),
    getStudentBalance(user.id, s.id),
    getStudentPayments(s.id, user.id),
    getMockScores(s.id, user.id),
    getStudentNotes(s.id, user.id),
    weakSpotsSummary(s.id),
    getUnreportedLessons(user.id, { studentId: s.id }),
  ]);
  const homeworks = hwAll.filter((h) => h.teacherId === user.id);
  const statuses = await Promise.all(homeworks.map((h) => homeworkStatus(h, s.id)));
  return {
    student: {
      id: s.id,
      name: s.name,
      email: s.email,
      grade: s.grade ?? null,
      targetScore: s.targetScore ?? null,
      nudged: nudgedRecently(s.nudgedAt),
      paymentReminders: !!s.paymentRemindersEnabled,
      lessonPriceRub: s.lessonPriceRub ?? null,
      groupLessonPriceRub: s.groupLessonPriceRub ?? null,
    },
    stats: {
      solved: stats.solvedProblems,
      accuracy: stats.accuracy,
      attempts: stats.attemptsCount,
      activeDays7: stats.activeDaysLast7,
      lastActiveAt: stats.lastActiveAt,
    },
    weak,
    reviews: pending.filter((r) => r.student.id === s.id).length,
    homeworks: homeworks
      .map((h, i) => ({
        id: h.id,
        title: h.title,
        kind: h.kind,
        dueDate: h.dueDate,
        createdAt: h.createdAt,
        total: statuses[i].total,
        done: statuses[i].done,
        overdue: statuses[i].overdue,
        complete: statuses[i].complete,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    lessons: { upcoming: collapseLessons(upcoming.slice(0, 20).map((l) => ({ ...l, studentName: s.name }))), unmarked: collapseLessons(unmarked) },
    logs: logs.slice(0, 30).map((l) => ({ id: l.id, date: l.date, topic: l.topic, report: l.report })),
    unreported: unreported.map((l) => ({ lessonId: l.id, startsAt: l.startsAt, topic: l.topic })),
    balance: balanceView(balance),
    payments: payments.slice(0, 50).map((p) => ({ id: p.id, amountRub: p.amountRub, lessonsCount: p.lessonsCount, paidAt: p.paidAt, note: p.note })),
    mocks: mocks.map((m) => ({ id: m.id, score: m.score, takenAt: m.takenAt, note: m.note ?? null })),
    notes: notes.notes,
    notesUpdatedAt: notes.updatedAt,
    parents: parents.map((p) => ({ id: p.id, name: p.name, email: p.email })),
  };
}

/** Неделя расписания (week — любой день недели, YYYY-MM-DD; по умолчанию текущая). */
export async function teacherSchedule(user: User, week?: string | null) {
  const todayKey = mskDayKey(new Date());
  const weekKey = mondayOf(/^\d{4}-\d{2}-\d{2}$/.test(week ?? "") ? week! : todayKey);
  const [students, groups, rows, unmarked, upcoming] = await Promise.all([
    getStudentsOfTeacher(user.id),
    getGroupsOfTeacher(user.id),
    getLessonsForTeacherRange(user.id, mskDayStart(weekKey), mskDayStart(addDaysKey(weekKey, 7))),
    getUnmarkedPastLessons(user.id),
    getUpcomingLessonsForTeacher(user.id, 1),
  ]);
  const unrep = new Set((await getUnreportedLessons(user.id)).map((l) => l.id));
  const lessons = collapseLessons(rows, unrep);
  return {
    weekStart: weekKey,
    today: todayKey,
    days: Array.from({ length: 7 }, (_, i) => {
      const key = addDaysKey(weekKey, i);
      return { key, lessons: lessons.filter((l) => mskDayKey(new Date(l.startsAt)) === key) };
    }),
    unmarked: collapseLessons(unmarked),
    next: collapseLessons(upcoming)[0] ?? null,
    students: students.map((s) => ({ id: s.id, name: s.name })).sort((a, b) => a.name.localeCompare(b.name, "ru")),
    groups: groups.map((g) => ({ id: g.id, name: g.name, count: g.members.length })),
  };
}

/** Очередь проверки. */
export async function teacherReviews(user: User) {
  const queue = await getPendingReviewsForTeacher(user.id);
  return {
    items: queue
      .map((r) => {
        const it = toReviewItem(r);
        return {
          attemptId: it.attemptId,
          student: it.student,
          problem: {
            id: it.problem.id,
            text: it.problem.text,
            egeTaskNumber: it.problem.egeTaskNumber,
            solution: it.problem.solution,
            diagramSvg: diagramSvg(it.problem.diagram ?? undefined),
          },
          maxPoints: it.problem.egeTaskNumber ? maxPointsForTask(it.problem.egeTaskNumber) : null,
          skillTitle: it.skillTitle,
          answer: it.answer,
          submittedAt: it.submittedAt,
          hasImage: it.hasImage,
          fromMock: it.fromMock,
        };
      })
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)),
  };
}

/** Оплаты: балансы, доход за месяц, последние оплаты, настройки. */
export async function teacherPayments(user: User) {
  const [thisFrom, thisTo] = currentMonthRangeMsk(0);
  const [prevFrom, prevTo] = currentMonthRangeMsk(-1);
  const [balances, incomeThis, incomePrev, recent] = await Promise.all([
    getStudentBalances(user.id),
    getIncomeBetween(user.id, thisFrom, thisTo),
    getIncomeBetween(user.id, prevFrom, prevTo),
    getRecentPaymentsForTeacher(user.id),
  ]);
  const names = new Map(balances.map((b) => [b.studentId, b.studentName]));
  return {
    incomeThis,
    incomePrev,
    balances: [...balances]
      .sort((a, b) => a.balance - b.balance || a.studentName.localeCompare(b.studentName, "ru"))
      .map((b) => ({ studentId: b.studentId, name: b.studentName, ...balanceView(b)! })),
    recent: recent.slice(0, 30).map((p) => ({
      id: p.id,
      studentId: p.studentId,
      name: names.get(p.studentId) ?? "",
      amountRub: p.amountRub,
      lessonsCount: p.lessonsCount,
      paidAt: p.paidAt,
      note: p.note,
    })),
    paymentInstructions: user.paymentInstructions ?? "",
    chargeMissed: !!user.chargeMissed,
  };
}

export async function teacherGroups(user: User) {
  const [students, groups] = await Promise.all([getStudentsOfTeacher(user.id), getGroupsOfTeacher(user.id)]);
  return {
    groups: groups.map((g) => ({ id: g.id, name: g.name, members: g.members })),
    students: students.map((s) => ({ id: s.id, name: s.name })).sort((a, b) => a.name.localeCompare(b.name, "ru")),
  };
}

export async function teacherGroup(user: User, groupId: string) {
  const group = await getGroupForTeacher(groupId, user.id);
  if (!group) return null;
  const [students, lessons, batches] = await Promise.all([
    getStudentsOfTeacher(user.id),
    getGroupLessons(group.id, user.id),
    getGroupHomeworkBatches(group.id, user.id),
  ]);
  const homeworks = await Promise.all(
    batches.map(async (b) => {
      const rows = await Promise.all(
        b.rows.map(async (r) => {
          const hw = (await getHomeworksForStudent(r.studentId)).find((h) => h.id === r.homeworkId);
          const st = hw ? await homeworkStatus(hw, r.studentId) : null;
          return { studentId: r.studentId, name: r.studentName, done: st?.done ?? 0, total: st?.total ?? b.problemCount, overdue: !!st?.overdue };
        })
      );
      return { batchId: b.batchId, title: b.title, kind: b.kind, dueDate: b.dueDate, problemCount: b.problemCount, rows };
    })
  );
  return {
    group: { id: group.id, name: group.name, members: group.members },
    students: students.map((s) => ({ id: s.id, name: s.name })).sort((a, b) => a.name.localeCompare(b.name, "ru")),
    unmarked: collapseLessons(lessons.unmarked),
    upcoming: collapseLessons(lessons.upcoming).slice(0, 20),
    homeworks,
  };
}

export async function teacherQuestions(user: User) {
  const qs = await getQuestionsForTeacher(user.id);
  return { questions: qs };
}

/** Конструктор задания: шаблоны, номера ЕГЭ, дерево навыков (задачи — отдельным запросом). */
export async function teacherBuilder(user: User, target: { studentId?: string | null; groupId?: string | null }) {
  let to: { kind: "student" | "group"; id: string; name: string } | null = null;
  let weak: { mistakes: number; numbers: number[] } | null = null;
  if (target.groupId) {
    const g = await getGroupForTeacher(target.groupId, user.id);
    if (!g || g.members.length === 0) return null;
    to = { kind: "group", id: g.id, name: g.name };
  } else if (target.studentId) {
    const s = await getUserById(target.studentId);
    if (!s || s.role !== "STUDENT" || s.teacherId !== user.id) return null;
    to = { kind: "student", id: s.id, name: s.name };
    weak = await weakSpotsSummary(s.id);
  } else return null;
  const [curriculum, numbers, templates] = await Promise.all([getCurriculum(), availableExamNumbers(), listTemplates(user.id)]);
  return {
    to,
    weak,
    examNumbers: numbers,
    defaultDue: addDaysKey(mskDayKey(new Date()), 7),
    templates: templates.map((t) => ({ id: t.id, title: t.title, kind: t.kind, count: t.problemIds.length, allowHints: t.allowHints, timeLimitMinutes: t.timeLimitMinutes })),
    topics: curriculum.map((t) => ({
      id: t.topic.id,
      title: t.topic.title,
      chapters: t.chapters.map((c) => ({
        id: c.chapter.id,
        title: c.chapter.title,
        skills: c.skills.map((s) => ({ id: s.id, title: s.title })),
      })),
    })),
  };
}

/** Задачи навыка для конструктора: текст и номер, без ответа. */
export async function teacherSkillProblems(skillId: string) {
  const problems = await getProblemsForSkill(skillId, true);
  return {
    problems: problems.map((p) => ({
      id: p.id,
      text: p.text,
      egeTaskNumber: p.egeTaskNumber ?? null,
      answerType: p.answerType,
      difficulty: p.difficulty,
      diagramSvg: diagramSvg(p.diagram),
    })),
  };
}

export function teacherSettings(user: User, studentsCount: number) {
  return {
    name: user.name,
    email: user.email,
    plan: planView(user, studentsCount),
    telegram: {
      connected: !!user.telegramChatId,
      homework: user.tgNotifyHomework !== false,
      lessons: user.tgNotifyLessons !== false,
      digest: user.tgDailyDigest !== false,
    },
  };
}

/** Черновик отчёта о занятии для формы в приложении. */
export async function teacherReportDraft(user: User, studentId: string, lessonId?: string | null) {
  const s = await getUserById(studentId);
  if (!s || s.role !== "STUDENT" || s.teacherId !== user.id) return null;
  return buildReportDraft(user.id, studentId, lessonId);
}
