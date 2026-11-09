/** Форматы ответов API /api/m/* (см. app/api/m на сервере). */

export type Role = "STUDENT" | "TEACHER" | "PARENT";

export interface UserSummary {
  id: string;
  name: string;
  email: string;
  role: Role;
  standalone: boolean;
  isPro: boolean;
  hasTeacher: boolean;
  emailVerified: boolean;
  targetScore: number | null;
  /** Вечерние напоминания о серии и сроках домашки (push и Telegram). */
  reminders?: boolean;
}

export interface SessionPayload {
  token: string;
  user: UserSummary;
}

export type PathState = "done" | "current" | "locked";

export interface HomePayload {
  user: UserSummary & { teacherName: string | null };
  stats: {
    xp: number;
    level: { title: string; progressPct: number };
    streak: number;
    dailyGoal: { done: number; total: number };
    energy: number | null;
    energyMax: number | null;
    examDaysLeft: number;
  };
  counts: { dueReview: number; mistakes: number; homework: number };
  /** Задания дня; в старых ответах сервера поля нет. */
  quests?: {
    items: { kind: string; title: string; target: number; progress: number; done: boolean }[];
    allDone: boolean;
    justRewarded: boolean;
    freezeGiven: boolean;
  };
  topics: { id: string; title: string; icon: string; done: number; total: number }[];
  topic: {
    id: string;
    title: string;
    icon: string;
    chapters: {
      id: string;
      title: string;
      skills: { id: string; title: string; state: PathState; solved: number; total: number; proOnly: boolean }[];
    }[];
  } | null;
  activeMock: { id: string; variant: number; answered: number; total: number; deadlineAt: string | null } | null;
}

export interface MobileProblem {
  id: string;
  text: string;
  answerType: "NUMBER" | "CHOICE" | "DETAILED";
  choices: { id: string; text: string }[] | null;
  diagramSvg: string | null;
  keyFormula: string | null;
  egeTaskNumber: number | null;
  hints: string[];
  check: string | null;
}

export interface ProblemStateM {
  status: "unsolved" | "solved" | "pending" | "needs_revision";
  solvedInfo?: { explanation: string; correctAnswer: string } | null;
  feedback?: string | null;
  previousAnswer?: string | null;
  review?: {
    attemptId: string;
    hasImage: boolean;
    marked: boolean;
    feedback: string | null;
    score: number | null;
    maxScore: number | null;
  } | null;
}

export interface TheoryCardM {
  title: string;
  formula: string | null;
  body: string;
  diagramSvg: string | null;
}

export type SkillPayload =
  | { status: "upgrade" }
  | { status: "locked"; topicId: string | null }
  | {
      status: "ok";
      skill: { id: string; title: string; theory: TheoryCardM[] };
      topicId: string | null;
      problems: MobileProblem[];
      states: Record<string, ProblemStateM>;
      next: { id: string; title: string } | null;
      forceTheoryFirst: boolean;
      detailedPreview: { text: string; solution: string; egeTaskNumber: number | null } | null;
      canAskTeacher: boolean;
    };

export type AttemptResult =
  | {
      kind: "correct";
      explanation: string;
      correctAnswer: string;
      selfChecked?: boolean;
      attemptId?: string;
      /** Задания дня, закрытые этим ответом. */
      questsDone?: string[];
      allQuestsDone?: boolean;
    }
  | { kind: "wrong"; hint: string; wrongCount: number; canRevealSolution: boolean }
  | { kind: "pending" }
  | { kind: "no_energy"; emailUnverified?: boolean };

export interface NotificationM {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string;
  read: boolean;
  createdAt: string;
}

export interface MockListPayload {
  allVariants: boolean;
  freeVariants: number[];
  modes: { id: "full" | "part1" | "free"; title: string; hint: string; minutes: number | null; part2: boolean }[];
  scaleIsEstimate: boolean;
  targetScore: number | null;
  variants: { variant: number; locked: boolean; best: number | null; tries: number }[];
  active: { id: string; variant: number; mode: string; answered: number; total: number; deadlineAt: string | null } | null;
  history: { id: string; variant: number; mode: string; finishedAt: string; testScore: number; primaryScore: number; part2Pending: number }[];
}

export interface MockRunnerPayload {
  status: "running";
  id: string;
  variant: number;
  mode: string;
  modeTitle: string;
  deadlineAt: string | null;
  startedAt: string;
  hasTeacher: boolean;
  items: { n: number; maxPoints: number; problem: MobileProblem }[];
  answers: Record<string, string>;
  flags: string[];
  timeSpent: Record<string, number>;
  photos: string[];
}

export interface Criterion {
  points: number;
  text: string;
}

export interface MockResultPayload {
  status: "finished";
  id: string;
  variant: number;
  mode: string;
  modeTitle: string;
  finishedAt: string;
  hasTeacher: boolean;
  testScore: number;
  primaryScore: number;
  maxPrimary: number;
  passScore: number;
  scaleIsEstimate: boolean;
  targetScore: number | null;
  previousScore: number | null;
  part2Pending: number;
  totalTime: number;
  part1: {
    n: number;
    problemId: string;
    text: string;
    diagramSvg: string | null;
    answer: string | null;
    correctAnswer: string;
    correct: boolean;
    explanation: string;
    seconds: number;
    skillId: string | null;
    skillTitle: string | null;
  }[];
  part2: {
    n: number;
    problemId: string;
    text: string;
    diagramSvg: string | null;
    max: number;
    score: number | null;
    status: "pending" | "reviewed" | "self" | "unscored" | "empty";
    feedback: string | null;
    attemptId: string | null;
    hasImage: boolean;
    textAnswer: string | null;
    solution: string;
    explanation: string | null;
    seconds: number;
    criteria: Criterion[] | null;
  }[];
}

export interface HomeworkItem {
  id: string;
  title: string;
  kind: "homework" | "test" | "exam";
  dueDate: string;
  timeLimitMinutes: number | null;
  done: number;
  total: number;
  overdue: boolean;
  complete: boolean;
}

export interface HomeworkDetail {
  homework: { id: string; title: string; kind: string; allowHints: boolean; dueDate: string };
  status: { done: number; total: number; overdue: boolean; complete: boolean };
  deadlineAt: string | null;
  items: { problem: MobileProblem; skillTitle: string; state: ProblemStateM }[];
}

export interface MistakeItem {
  problem: MobileProblem;
  skillId: string | null;
  skillTitle: string;
  chapterTitle: string;
  wrongAttempts: number;
  lastWrongAnswer: string;
  resolved: boolean;
}
