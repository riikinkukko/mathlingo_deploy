import { db } from "./db/client";
import * as schema from "./db/schema";
import { eq, and, inArray, desc, asc, sql } from "drizzle-orm";
import {
  Homework,
  Problem,
  PublicProblem,
  Skill,
  Subtopic,
  User,
  SolvedInfo,
  Notification,
  AssignmentSession,
  Attempt,
} from "./types";

// ---------- Мапперы: строка Drizzle (null) -> тип приложения (undefined) ----------
// Драйзл возвращает null для необязательных колонок, а наши типы исторически
// используют undefined (?), поэтому нормализуем на границе слоя данных —
// остальной код (условия вида if (x.skillId)) не пришлось трогать.

function mapUser(row: typeof schema.users.$inferSelect): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.passwordHash,
    role: row.role,
    teacherId: row.teacherId ?? undefined,
    plan: row.plan ?? undefined,
    energy: row.energy ?? undefined,
    energyUpdatedAt: row.energyUpdatedAt ? row.energyUpdatedAt.toISOString() : undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapSkill(row: typeof schema.skills.$inferSelect): Skill {
  return {
    id: row.id,
    subtopicId: row.subtopicId,
    order: row.order,
    title: row.title,
    theoryCards: row.theoryCards as Skill["theoryCards"],
  };
}

function mapProblem(row: typeof schema.problems.$inferSelect): Problem {
  return {
    id: row.id,
    skillId: row.skillId ?? undefined,
    text: row.text,
    answerType: row.answerType,
    correctAnswer: row.correctAnswer,
    choices: (row.choices as Problem["choices"]) ?? undefined,
    diagram: (row.diagram as Problem["diagram"]) ?? undefined,
    keyFormula: row.keyFormula ?? undefined,
    hints: row.hints as string[],
    explanation: row.explanation,
    difficulty: row.difficulty as 1 | 2 | 3,
    egeTaskNumber: row.egeTaskNumber ?? undefined,
    tier: row.tier ?? undefined,
  };
}

function mapHomework(row: typeof schema.homeworks.$inferSelect): Homework {
  return {
    id: row.id,
    teacherId: row.teacherId ?? undefined,
    studentId: row.studentId ?? undefined,
    title: row.title,
    kind: row.kind,
    allowHints: row.allowHints,
    timeLimitMinutes: row.timeLimitMinutes ?? undefined,
    audience: row.audience ?? undefined,
    problemIds: row.problemIds as string[],
    dueDate: row.dueDate.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function mapAttempt(row: typeof schema.attempts.$inferSelect): Attempt {
  return {
    id: row.id,
    studentId: row.studentId,
    problemId: row.problemId,
    answer: row.answer,
    isCorrect: row.isCorrect,
    source: row.source,
    reviewStatus: row.reviewStatus ?? undefined,
    teacherFeedback: row.teacherFeedback ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapNotification(row: typeof schema.notifications.$inferSelect): Notification {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    read: row.read,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Убирает ответ/подсказки/разбор перед отправкой в клиентский компонент. */
export function toPublicProblem(p: Problem): PublicProblem {
  const { correctAnswer, hints, explanation, ...rest } = p;
  return rest;
}

// ---------- Программа: Topic -> Subtopic(глава) -> Skill(урок-навык) ----------

export async function getCurriculum() {
  const topics = await db.select().from(schema.topics).orderBy(asc(schema.topics.order));
  const subtopics = await db.select().from(schema.subtopics).orderBy(asc(schema.subtopics.order));
  const skillRows = await db.select().from(schema.skills).orderBy(asc(schema.skills.order));
  const skills = skillRows.map(mapSkill);

  return topics.map((topic) => ({
    topic,
    chapters: subtopics
      .filter((s) => s.topicId === topic.id)
      .map((chapter) => ({
        chapter,
        skills: skills.filter((sk) => sk.subtopicId === chapter.id),
      })),
  }));
}

export async function getAllSkillsFlat(): Promise<Skill[]> {
  const chapters = await db.select().from(schema.subtopics).orderBy(asc(schema.subtopics.order));
  const skillRows = await db.select().from(schema.skills).orderBy(asc(schema.skills.order));
  const skills = skillRows.map(mapSkill);
  return chapters.flatMap((c) => skills.filter((sk) => sk.subtopicId === c.id));
}

export async function getSkill(skillId: string): Promise<Skill | undefined> {
  const rows = await db.select().from(schema.skills).where(eq(schema.skills.id, skillId)).limit(1);
  return rows[0] ? mapSkill(rows[0]) : undefined;
}

export async function getChapter(subtopicId: string): Promise<Subtopic | undefined> {
  const rows = await db
    .select()
    .from(schema.subtopics)
    .where(eq(schema.subtopics.id, subtopicId))
    .limit(1);
  return rows[0];
}

export async function getSkillsForChapter(subtopicId: string): Promise<Skill[]> {
  const rows = await db
    .select()
    .from(schema.skills)
    .where(eq(schema.skills.subtopicId, subtopicId))
    .orderBy(asc(schema.skills.order));
  return rows.map(mapSkill);
}

/** По умолчанию — только "core" (то, что показывается в уроке). Для банка
 * задач (конструктор ДЗ/контрольной у учителя) передайте includeBank=true. */
export async function getProblemsForSkill(skillId: string, includeBank = false): Promise<Problem[]> {
  const rows = await db.select().from(schema.problems).where(eq(schema.problems.skillId, skillId));
  const problems = rows.map(mapProblem);
  return includeBank ? problems : problems.filter((p) => (p.tier ?? "core") === "core");
}

export async function getProblem(problemId: string): Promise<Problem | undefined> {
  const rows = await db.select().from(schema.problems).where(eq(schema.problems.id, problemId)).limit(1);
  return rows[0] ? mapProblem(rows[0]) : undefined;
}

/** Для каждого НАВЫКА: сколько задач решено верно (уникальных) из скольких всего. */
export async function computeStudentProgress(studentId: string) {
  const problemRows = await db.select().from(schema.problems);
  const problems = problemRows.map(mapProblem);
  const skillRows = await db.select().from(schema.skills);

  const attemptRows = await db
    .select()
    .from(schema.attempts)
    .where(
      and(
        eq(schema.attempts.studentId, studentId),
        eq(schema.attempts.isCorrect, true),
        eq(schema.attempts.source, "lesson")
      )
    );

  const result: Record<string, { solved: number; total: number; pct: number }> = {};
  for (const skill of skillRows) {
    const skillProblems = problems.filter(
      (p) => p.skillId === skill.id && (p.tier ?? "core") === "core"
    );
    const skillProblemIds = new Set(skillProblems.map((p) => p.id));
    const solvedIds = new Set(
      attemptRows.filter((a) => skillProblemIds.has(a.problemId)).map((a) => a.problemId)
    );
    result[skill.id] = {
      solved: solvedIds.size,
      total: skillProblems.length,
      pct: skillProblems.length ? Math.round((solvedIds.size / skillProblems.length) * 100) : 0,
    };
  }
  return result;
}

/** Прогресс главы (chapter) — агрегат прогресса всех её навыков. */
export async function computeChapterProgress(
  studentId: string,
  subtopicId: string,
  skillProgress: Record<string, { solved: number; total: number; pct: number }>
) {
  const skills = await getSkillsForChapter(subtopicId);
  const doneSkills = skills.filter((s) => (skillProgress[s.id]?.pct ?? 0) === 100).length;
  return { doneSkills, totalSkills: skills.length };
}

export async function computeOverallStats(studentId: string) {
  const attempts = (
    await db.select().from(schema.attempts).where(eq(schema.attempts.studentId, studentId))
  ).map(mapAttempt);
  const correct = attempts.filter((a) => a.isCorrect);
  const solvedProblems = new Set(correct.map((a) => a.problemId)).size;
  const [{ count: totalProblems }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.problems);
  const last7 = attempts.filter(
    (a) => Date.now() - new Date(a.createdAt).getTime() < 7 * 24 * 3600 * 1000
  );
  const activeDays = new Set(last7.map((a) => a.createdAt.slice(0, 10))).size;
  return {
    attemptsCount: attempts.length,
    solvedProblems,
    totalProblems,
    accuracy: attempts.length ? Math.round((correct.length / attempts.length) * 100) : 0,
    activeDaysLast7: activeDays,
  };
}

export async function computeXp(studentId: string) {
  const attempts = (
    await db.select().from(schema.attempts).where(eq(schema.attempts.studentId, studentId))
  ).map(mapAttempt);
  const correct = attempts.filter((a) => a.isCorrect);
  let xp = correct.length * 10;

  // Бонус +30 за навыки, пройденные без единой ошибки (только по "урочным"
  // попыткам — согласовано с тем, что считается прогрессом пути).
  const skillRows = await db.select().from(schema.skills);
  const problems = (await db.select().from(schema.problems)).map(mapProblem);
  const lessonAttempts = attempts.filter((a) => a.source === "lesson");

  for (const skill of skillRows) {
    const problemIds = problems
      .filter((p) => p.skillId === skill.id && (p.tier ?? "core") === "core")
      .map((p) => p.id);
    if (problemIds.length === 0) continue;
    const attemptsHere = lessonAttempts.filter((a) => problemIds.includes(a.problemId));
    const allSolved = problemIds.every((id) =>
      attemptsHere.some((a) => a.problemId === id && a.isCorrect)
    );
    const noMistakes = attemptsHere.every((a) => a.isCorrect);
    if (allSolved && noMistakes) xp += 30;
  }
  return xp;
}

// ---------- Уровни/звания — обёртка над XP для наглядной прогрессии ----------

export const LEVELS = [
  { minXp: 0, title: "Новичок" },
  { minXp: 100, title: "Знаток фигур" },
  { minXp: 300, title: "Мастер линий" },
  { minXp: 600, title: "Гений треугольников" },
  { minXp: 1000, title: "Виртуоз планиметрии" },
  { minXp: 1500, title: "Легенда ЕГЭ" },
] as const;

export interface LevelInfo {
  index: number;
  title: string;
  xp: number;
  currentLevelMinXp: number;
  nextLevelMinXp: number | null; // null — максимальный уровень достигнут
  progressPct: number; // 0..100 до следующего уровня
}

export function getLevelInfo(xp: number): LevelInfo {
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i].minXp) idx = i;
  }
  const current = LEVELS[idx];
  const next = LEVELS[idx + 1] ?? null;
  const progressPct = next
    ? Math.round(((xp - current.minXp) / (next.minXp - current.minXp)) * 100)
    : 100;
  return {
    index: idx,
    title: current.title,
    xp,
    currentLevelMinXp: current.minXp,
    nextLevelMinXp: next ? next.minXp : null,
    progressPct: Math.min(100, Math.max(0, progressPct)),
  };
}

export async function computeStreak(studentId: string) {
  const attempts = await db
    .select({ createdAt: schema.attempts.createdAt })
    .from(schema.attempts)
    .where(eq(schema.attempts.studentId, studentId));
  const days = new Set(attempts.map((a) => a.createdAt.toISOString().slice(0, 10)));
  if (days.size === 0) return 0;

  const cursor = new Date();
  const todayStr = cursor.toISOString().slice(0, 10);
  if (!days.has(todayStr)) cursor.setDate(cursor.getDate() - 1);

  let streak = 0;
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export type PathState = "done" | "current" | "locked";

/** Навык разблокирован, если он первый в общем списке, либо предыдущий пройден на 100%. */
export function getPathStates(
  skills: { id: string }[],
  progress: Record<string, { pct: number }>
): Record<string, PathState> {
  const result: Record<string, PathState> = {};
  let previousDone = true;
  for (const s of skills) {
    const pct = progress[s.id]?.pct ?? 0;
    if (pct === 100) {
      result[s.id] = "done";
      previousDone = true;
    } else if (previousDone) {
      result[s.id] = "current";
      previousDone = false;
    } else {
      result[s.id] = "locked";
    }
  }
  return result;
}

export function getNextSkill<T extends { id: string }>(skills: T[], currentId: string): T | null {
  const idx = skills.findIndex((s) => s.id === currentId);
  if (idx === -1 || idx === skills.length - 1) return null;
  return skills[idx + 1];
}

export async function getStudentsOfTeacher(teacherId: string): Promise<User[]> {
  const rows = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.role, "STUDENT"), eq(schema.users.teacherId, teacherId)));
  return rows.map(mapUser);
}

export async function getChildrenOfParent(parentId: string): Promise<User[]> {
  const links = await db
    .select()
    .from(schema.parentLinks)
    .where(eq(schema.parentLinks.parentId, parentId));
  const studentIds = links.map((l) => l.studentId);
  if (studentIds.length === 0) return [];
  const rows = await db.select().from(schema.users).where(inArray(schema.users.id, studentIds));
  return rows.map(mapUser);
}

export async function homeworkStatus(hw: Homework, studentId: string) {
  const correctRows = await db
    .select({ problemId: schema.attempts.problemId })
    .from(schema.attempts)
    .where(and(eq(schema.attempts.studentId, studentId), eq(schema.attempts.isCorrect, true)));
  const correctIds = new Set(correctRows.map((r) => r.problemId));
  const done = hw.problemIds.filter((id) => correctIds.has(id)).length;
  const total = hw.problemIds.length;
  const overdue = !!hw.dueDate && new Date(hw.dueDate) < new Date() && done < total;
  return { done, total, overdue, complete: done === total };
}

export async function getUserById(id: string): Promise<User | undefined> {
  const rows = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  return rows[0] ? mapUser(rows[0]) : undefined;
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const rows = await db
    .select()
    .from(schema.users)
    .where(sql`lower(${schema.users.email}) = lower(${email})`)
    .limit(1);
  return rows[0] ? mapUser(rows[0]) : undefined;
}

// ---------- Разбор ошибок для учителя ----------

export interface MistakeEntry {
  problem: Problem;
  skillTitle: string;
  chapterTitle: string;
  wrongAttempts: number;
  lastWrongAnswer: string;
  lastAttemptAt: string;
  resolved: boolean; // решил ли в итоге верно
}

/** Список задач, где ученик ошибался — для секции "Разбор ошибок" у учителя. */
export async function getMistakesForStudent(studentId: string): Promise<MistakeEntry[]> {
  const attempts = (
    await db.select().from(schema.attempts).where(eq(schema.attempts.studentId, studentId))
  ).map(mapAttempt);
  const problems = (await db.select().from(schema.problems)).map(mapProblem);
  const skillRows = await db.select().from(schema.skills);
  const chapterRows = await db.select().from(schema.subtopics);

  const byProblem = new Map<string, Attempt[]>();
  for (const a of attempts) {
    if (!byProblem.has(a.problemId)) byProblem.set(a.problemId, []);
    byProblem.get(a.problemId)!.push(a);
  }

  const entries: MistakeEntry[] = [];
  for (const [problemId, problemAttempts] of byProblem) {
    // DETAILED-попытки живут в своём workflow (см. getPendingReviewsForTeacher) —
    // не мешаем их в общий разбор ошибок.
    const wrong = problemAttempts.filter((a) => !a.isCorrect && !a.reviewStatus);
    if (wrong.length === 0) continue;
    const problem = problems.find((p) => p.id === problemId);
    if (!problem) continue;
    const skill = skillRows.find((s) => s.id === problem.skillId);
    const chapter = skill ? chapterRows.find((c) => c.id === skill.subtopicId) : undefined;
    const lastWrong = wrong[wrong.length - 1];
    entries.push({
      problem,
      skillTitle: skill?.title ?? "—",
      chapterTitle: chapter?.title ?? "—",
      wrongAttempts: wrong.length,
      lastWrongAnswer: lastWrong.answer,
      lastAttemptAt: lastWrong.createdAt,
      resolved: problemAttempts.some((a) => a.isCorrect),
    });
  }
  return entries.sort((a, b) => b.lastAttemptAt.localeCompare(a.lastAttemptAt));
}

// ---------- Журнал занятий ----------

export async function getLessonLogsForStudent(studentId: string) {
  const rows = await db
    .select()
    .from(schema.lessonLogs)
    .where(eq(schema.lessonLogs.studentId, studentId))
    .orderBy(desc(schema.lessonLogs.date));
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

// ---------- Развёрнутые (DETAILED) ответы, ожидающие проверки ----------

export interface PendingReview {
  attemptId: string;
  student: User;
  problem: Problem;
  skillTitle: string;
  answer: string;
  submittedAt: string;
}

export async function getPendingReviewsForTeacher(teacherId: string): Promise<PendingReview[]> {
  const students = await getStudentsOfTeacher(teacherId);
  const studentIds = students.map((s) => s.id);
  if (studentIds.length === 0) return [];

  const attemptRows = await db
    .select()
    .from(schema.attempts)
    .where(and(eq(schema.attempts.reviewStatus, "pending"), inArray(schema.attempts.studentId, studentIds)));

  const problems = (await db.select().from(schema.problems)).map(mapProblem);
  const skillRows = await db.select().from(schema.skills);
  const studentById = new Map(students.map((s) => [s.id, s]));

  const result: PendingReview[] = [];
  for (const a of attemptRows) {
    const problem = problems.find((p) => p.id === a.problemId);
    const student = studentById.get(a.studentId);
    if (!problem || !student) continue;
    const skill = skillRows.find((s) => s.id === problem.skillId);
    result.push({
      attemptId: a.id,
      student,
      problem,
      skillTitle: skill?.title ?? "—",
      answer: a.answer,
      submittedAt: a.createdAt.toISOString(),
    });
  }
  return result.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
}

// ---------- Состояние задачи для карточки (учитывает DETAILED-ревью) ----------

export interface ProblemState {
  status: "unsolved" | "solved" | "pending" | "needs_revision";
  solvedInfo?: SolvedInfo;
  feedback?: string;
  previousAnswer?: string;
}

export async function computeProblemStates(
  studentId: string,
  problems: Problem[]
): Promise<Record<string, ProblemState>> {
  if (problems.length === 0) return {};
  const problemIds = problems.map((p) => p.id);
  const attemptRows = (
    await db
      .select()
      .from(schema.attempts)
      .where(and(eq(schema.attempts.studentId, studentId), inArray(schema.attempts.problemId, problemIds)))
      .orderBy(asc(schema.attempts.createdAt))
  ).map(mapAttempt);

  const result: Record<string, ProblemState> = {};
  for (const p of problems) {
    const attempts = attemptRows.filter((a) => a.problemId === p.id);
    if (attempts.length === 0) {
      result[p.id] = { status: "unsolved" };
      continue;
    }
    const last = attempts[attempts.length - 1];
    if (p.answerType === "DETAILED") {
      if (last.reviewStatus === "approved" || last.reviewStatus === "self_checked") {
        result[p.id] = {
          status: "solved",
          solvedInfo: { explanation: p.explanation, correctAnswer: p.correctAnswer },
        };
      } else if (last.reviewStatus === "needs_revision") {
        result[p.id] = {
          status: "needs_revision",
          feedback: last.teacherFeedback,
          previousAnswer: last.answer,
        };
      } else {
        result[p.id] = { status: "pending", previousAnswer: last.answer };
      }
    } else {
      const solved = attempts.some((a) => a.isCorrect);
      result[p.id] = solved
        ? { status: "solved", solvedInfo: { explanation: p.explanation, correctAnswer: p.correctAnswer } }
        : { status: "unsolved" };
    }
  }
  return result;
}

// ---------- Уведомления ----------

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

/** Кладёт уведомление. Принимает либо обычный db, либо активную транзакцию —
 * так вызывающий код может завернуть несколько связанных записей в одну
 * атомарную транзакцию (например, попытка + уведомление). */
export async function pushNotification(
  tx: Tx,
  params: { userId: string; type: Notification["type"]; title: string; body: string; link: string }
) {
  await tx.insert(schema.notifications).values({
    id: genId("n"),
    userId: params.userId,
    type: params.type,
    title: params.title,
    body: params.body,
    link: params.link,
    read: false,
  });
}

export async function getNotificationsForUser(userId: string, limit = 20): Promise<Notification[]> {
  const rows = await db
    .select()
    .from(schema.notifications)
    .where(eq(schema.notifications.userId, userId))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(limit);
  return rows.map(mapNotification);
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.userId, userId), eq(schema.notifications.read, false)));
  return count;
}

// ---------- Таймер задания ----------

/** Возвращает существующую сессию прохождения задания или создаёт новую (старт отсчёта). */
export async function getOrCreateAssignmentSession(
  homeworkId: string,
  studentId: string
): Promise<AssignmentSession> {
  const existing = await db
    .select()
    .from(schema.assignmentSessions)
    .where(
      and(
        eq(schema.assignmentSessions.homeworkId, homeworkId),
        eq(schema.assignmentSessions.studentId, studentId)
      )
    )
    .limit(1);
  if (existing[0]) {
    return { ...existing[0], startedAt: existing[0].startedAt.toISOString() };
  }

  const id = genId("as");
  const startedAt = new Date();
  await db.insert(schema.assignmentSessions).values({ id, homeworkId, studentId, startedAt });
  return { id, homeworkId, studentId, startedAt: startedAt.toISOString() };
}

// ---------- Планы (Free/Pro) и энергия для самостоятельных учеников ----------

export const FREE_MAX_ENERGY = 5;
export const ENERGY_RECHARGE_MINUTES = 30;

/** Ученики репетитора (с teacherId) и все не-ученики — вне системы планов,
 * для них энергия всегда безлимитна. Ограничение касается только тех, кто
 * зарегистрировался сам и не находится на Pro-плане. */
export function isUnlimitedEnergy(user: User): boolean {
  return user.role !== "STUDENT" || !!user.teacherId || user.plan === "pro";
}

export function isStandaloneStudent(user: User): boolean {
  return user.role === "STUDENT" && !user.teacherId;
}

/** Текущий эффективный запас энергии с учётом "ленивого" начисления —
 * подзарядка считается на лету по времени с последнего обновления, без
 * фоновых задач/крона. */
export function getEffectiveEnergy(user: User): number {
  if (isUnlimitedEnergy(user)) return Infinity;
  const last = new Date(user.energyUpdatedAt ?? user.createdAt).getTime();
  const elapsedMin = (Date.now() - last) / 60000;
  const recharged = Math.floor(elapsedMin / ENERGY_RECHARGE_MINUTES);
  const base = user.energy ?? FREE_MAX_ENERGY;
  return Math.min(FREE_MAX_ENERGY, base + recharged);
}

export function minutesUntilNextEnergy(user: User): number {
  if (isUnlimitedEnergy(user)) return 0;
  const current = getEffectiveEnergy(user);
  if (current >= FREE_MAX_ENERGY) return 0;
  const last = new Date(user.energyUpdatedAt ?? user.createdAt).getTime();
  const elapsedMin = (Date.now() - last) / 60000;
  const intoCurrentCycle = elapsedMin % ENERGY_RECHARGE_MINUTES;
  return Math.max(0, Math.ceil(ENERGY_RECHARGE_MINUTES - intoCurrentCycle));
}

/** Списывает 1 энергию (если применимо) прямо в БД. Возвращает false, если
 * энергии не осталось — вызывающий код должен показать заглушку вместо
 * задачи. Принимает tx для атомарности с остальными записями попытки. */
export async function spendEnergy(tx: Tx, userId: string): Promise<boolean> {
  const rows = await tx.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  const row = rows[0];
  if (!row) return false;
  const user = mapUser(row);
  if (isUnlimitedEnergy(user)) return true;
  const current = getEffectiveEnergy(user);
  if (current <= 0) return false;
  await tx
    .update(schema.users)
    .set({ energy: current - 1, energyUpdatedAt: new Date() })
    .where(eq(schema.users.id, userId));
  return true;
}

// ---------- Задания для ученика: свои + общие Pro-пробники ----------

export async function getHomeworksForStudent(studentId: string): Promise<Homework[]> {
  const user = await getUserById(studentId);
  const own = (
    await db.select().from(schema.homeworks).where(eq(schema.homeworks.studentId, studentId))
  ).map(mapHomework);
  let proExams: Homework[] = [];
  if (user && isStandaloneStudent(user) && user.plan === "pro") {
    proExams = (
      await db.select().from(schema.homeworks).where(eq(schema.homeworks.audience, "pro_standalone"))
    ).map(mapHomework);
  }
  return [...own, ...proExams].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

// ---------- SRS (интервальное повторение, коробки Лейтнера) ----------
// 5 коробок, интервал в днях до следующего показа растёт с каждым верным
// ответом подряд; любая ошибка отбрасывает задачу обратно в 1-ю коробку.
// Участвуют только "урочные" задачи (source lesson/review) — попытки из
// ДЗ/контрольных SRS не трогают, это отдельный, оценочный контекст.
export const SRS_BOX_INTERVALS_DAYS = [1, 3, 7, 14, 30];
export const SRS_MAX_BOX = SRS_BOX_INTERVALS_DAYS.length;
export const SRS_DAILY_LIMIT = 15;

/** Обновляет (или создаёт) состояние повторения для пары ученик-задача.
 * Вызывается из performSubmitAttempt — только для NUMBER/CHOICE (не DETAILED,
 * у него отдельный процесс проверки, не вписывающийся в мгновенный
 * верно/неверно) и только когда source lesson/review. */
export async function updateSrsState(tx: Tx, studentId: string, problemId: string, isCorrect: boolean) {
  const existing = await tx
    .select()
    .from(schema.srsStates)
    .where(and(eq(schema.srsStates.studentId, studentId), eq(schema.srsStates.problemId, problemId)))
    .limit(1);

  const prevBox = existing[0]?.box ?? 0;
  const newBox = isCorrect ? Math.min(SRS_MAX_BOX, prevBox + 1) : 1;
  const intervalDays = SRS_BOX_INTERVALS_DAYS[newBox - 1];
  const now = new Date();
  const nextReviewAt = new Date(now.getTime() + intervalDays * 86400 * 1000);

  if (existing[0]) {
    await tx
      .update(schema.srsStates)
      .set({
        box: newBox,
        reviewCount: existing[0].reviewCount + 1,
        lastReviewedAt: now,
        nextReviewAt,
      })
      .where(and(eq(schema.srsStates.studentId, studentId), eq(schema.srsStates.problemId, problemId)));
  } else {
    await tx.insert(schema.srsStates).values({
      studentId,
      problemId,
      box: newBox,
      reviewCount: 1,
      lastReviewedAt: now,
      nextReviewAt,
    });
  }
}

/** Сколько задач сейчас "созрело" для повторения (nextReviewAt в прошлом). */
export async function getDueReviewCount(studentId: string): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.srsStates)
    .where(and(eq(schema.srsStates.studentId, studentId), sql`${schema.srsStates.nextReviewAt} <= now()`));
  return count;
}

export interface DueReviewProblem {
  problem: Problem;
  skillTitle: string;
  box: number;
}

/** Задачи, готовые к повторению — самые "просроченные" (давно ждущие) первыми. */
export async function getDueReviewProblems(
  studentId: string,
  limit = SRS_DAILY_LIMIT
): Promise<DueReviewProblem[]> {
  const dueStates = await db
    .select()
    .from(schema.srsStates)
    .where(and(eq(schema.srsStates.studentId, studentId), sql`${schema.srsStates.nextReviewAt} <= now()`))
    .orderBy(asc(schema.srsStates.nextReviewAt))
    .limit(limit);
  if (dueStates.length === 0) return [];

  const problemIds = dueStates.map((s) => s.problemId);
  const problemRows = await db.select().from(schema.problems).where(inArray(schema.problems.id, problemIds));
  const problems = problemRows.map(mapProblem);
  const skillIds = [...new Set(problems.map((p) => p.skillId).filter((id): id is string => !!id))];
  const skillRows = skillIds.length
    ? await db.select().from(schema.skills).where(inArray(schema.skills.id, skillIds))
    : [];

  const result: DueReviewProblem[] = [];
  for (const state of dueStates) {
    const problem = problems.find((p) => p.id === state.problemId);
    if (!problem) continue;
    const skill = skillRows.find((s) => s.id === problem.skillId);
    result.push({ problem, skillTitle: skill?.title ?? "—", box: state.box });
  }
  return result;
}

// ---------- CRUD контента (главы/навыки/задачи) для UI учителя ----------
// В отличие от чтения выше, это единственное место в queries.ts, которое
// МЕНЯЕТ контент программы напрямую (не через scripts/seed.ts). Раньше
// правка контента была возможна только через код + npm run seed — теперь
// то же самое можно сделать через интерфейс.

export async function getTopicId(): Promise<string | undefined> {
  const rows = await db.select({ id: schema.topics.id }).from(schema.topics).limit(1);
  return rows[0]?.id;
}

export async function createChapter(title: string, order: number): Promise<string> {
  const topicId = await getTopicId();
  if (!topicId) throw new Error("Нет ни одного модуля (Topic) — так не должно быть, проверьте seed.");
  const id = genId("ch");
  await db.insert(schema.subtopics).values({ id, topicId, title, order });
  return id;
}

export async function updateChapter(id: string, data: { title: string; order: number }) {
  await db.update(schema.subtopics).set(data).where(eq(schema.subtopics.id, id));
}

export async function createSkill(
  subtopicId: string,
  data: { title: string; order: number; theoryCards: Skill["theoryCards"] }
): Promise<string> {
  const id = genId("sk");
  await db.insert(schema.skills).values({ id, subtopicId, ...data });
  return id;
}

export async function updateSkill(
  id: string,
  data: { title: string; order: number; theoryCards: Skill["theoryCards"] }
) {
  await db.update(schema.skills).set(data).where(eq(schema.skills.id, id));
}

export interface ProblemInput {
  skillId: string | null;
  text: string;
  answerType: Problem["answerType"];
  correctAnswer: string;
  choices: Problem["choices"];
  diagram: Problem["diagram"];
  keyFormula: string | null;
  hints: string[];
  explanation: string;
  difficulty: 1 | 2 | 3;
  egeTaskNumber: number | null;
  tier: Problem["tier"];
}

export async function createProblem(data: ProblemInput): Promise<string> {
  const id = genId("p");
  await db.insert(schema.problems).values({
    id,
    skillId: data.skillId,
    text: data.text,
    answerType: data.answerType,
    correctAnswer: data.correctAnswer,
    choices: data.choices ?? null,
    diagram: data.diagram ?? null,
    keyFormula: data.keyFormula,
    hints: data.hints,
    explanation: data.explanation,
    difficulty: data.difficulty,
    egeTaskNumber: data.egeTaskNumber,
    tier: data.tier ?? null,
  });
  return id;
}

export async function updateProblem(id: string, data: ProblemInput) {
  await db
    .update(schema.problems)
    .set({
      skillId: data.skillId,
      text: data.text,
      answerType: data.answerType,
      correctAnswer: data.correctAnswer,
      choices: data.choices ?? null,
      diagram: data.diagram ?? null,
      keyFormula: data.keyFormula,
      hints: data.hints,
      explanation: data.explanation,
      difficulty: data.difficulty,
      egeTaskNumber: data.egeTaskNumber,
      tier: data.tier ?? null,
    })
    .where(eq(schema.problems.id, id));
}

/** Сколько попыток учеников уже есть по этой задаче — используется, чтобы
 * не дать удалить задачу, если это стёрло бы чью-то историю прогресса
 * (внешний ключ attempts.problemId настроен на ON DELETE CASCADE). */
export async function countAttemptsForProblem(problemId: string): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.attempts)
    .where(eq(schema.attempts.problemId, problemId));
  return count;
}

/** true, если удаление прошло; false, если заблокировано (есть попытки). */
export async function deleteProblemSafely(problemId: string): Promise<boolean> {
  const attemptsCount = await countAttemptsForProblem(problemId);
  if (attemptsCount > 0) return false;
  await db.delete(schema.problems).where(eq(schema.problems.id, problemId));
  return true;
}

// ---------- Генератор id (заменяет genId из старого lib/db.ts) ----------

export function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// ---------- Прямые точечные запросы, которые раньше делали readDB() ----------

export async function isParentOf(parentId: string, studentId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(schema.parentLinks)
    .where(and(eq(schema.parentLinks.parentId, parentId), eq(schema.parentLinks.studentId, studentId)))
    .limit(1);
  return rows.length > 0;
}

export async function getParentsOfStudent(studentId: string): Promise<User[]> {
  const links = await db
    .select()
    .from(schema.parentLinks)
    .where(eq(schema.parentLinks.studentId, studentId));
  const parentIds = links.map((l) => l.parentId);
  if (parentIds.length === 0) return [];
  const rows = await db.select().from(schema.users).where(inArray(schema.users.id, parentIds));
  return rows.map(mapUser);
}

export async function getHomeworkById(id: string): Promise<Homework | undefined> {
  const rows = await db.select().from(schema.homeworks).where(eq(schema.homeworks.id, id)).limit(1);
  return rows[0] ? mapHomework(rows[0]) : undefined;
}
