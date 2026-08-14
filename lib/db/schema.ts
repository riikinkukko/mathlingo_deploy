import {
  pgTable,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  pgEnum,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ---------------- Enum'ы (настоящая проверка на уровне БД — в JSON её не было) ----------------

export const roleEnum = pgEnum("role", ["STUDENT", "TEACHER", "PARENT"]);
export const planEnum = pgEnum("plan", ["free", "pro"]);
export const answerTypeEnum = pgEnum("answer_type", ["NUMBER", "CHOICE", "DETAILED"]);
export const tierEnum = pgEnum("tier", ["core", "bank"]);
export const attemptSourceEnum = pgEnum("attempt_source", ["lesson", "assignment", "review"]);
export const reviewStatusEnum = pgEnum("review_status", [
  "pending",
  "approved",
  "needs_revision",
  "self_checked",
]);
export const assignmentKindEnum = pgEnum("assignment_kind", ["homework", "test", "exam"]);
export const audienceEnum = pgEnum("audience", ["assigned", "pro_standalone"]);
export const notificationTypeEnum = pgEnum("notification_type", [
  "assignment_created",
  "lesson_log_added",
  "review_decided",
  "review_pending",
  "skill_completed",
]);

// ---------------- Таблицы ----------------

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull(),
  // Самоссылка: репетитор, который ведёт ученика. NULL — самостоятельный
  // пользователь (не чей-то ученик), для него имеют смысл plan/energy.
  teacherId: text("teacher_id"),
  plan: planEnum("plan"),
  energy: integer("energy"),
  energyUpdatedAt: timestamp("energy_updated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const parentLinks = pgTable(
  "parent_links",
  {
    parentId: text("parent_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.parentId, t.studentId] }) })
);

export const topics = pgTable("topics", {
  id: text("id").primaryKey(),
  order: integer("order").notNull(),
  title: text("title").notNull(),
});

// "Глава" (в коде исторически звалась Subtopic) — группирует несколько Skill.
export const subtopics = pgTable("subtopics", {
  id: text("id").primaryKey(),
  topicId: text("topic_id")
    .notNull()
    .references(() => topics.id, { onDelete: "cascade" }),
  order: integer("order").notNull(),
  title: text("title").notNull(),
});

// Навык-урок — теория + задачи. theoryCards хранится как jsonb (массив
// {title, formula?, body, diagram?} — вложенная структура, нормализовывать
// в отдельную таблицу избыточно для MVP).
export const skills = pgTable("skills", {
  id: text("id").primaryKey(),
  subtopicId: text("subtopic_id")
    .notNull()
    .references(() => subtopics.id, { onDelete: "cascade" }),
  order: integer("order").notNull(),
  title: text("title").notNull(),
  theoryCards: jsonb("theory_cards").notNull().$type<unknown[]>(),
});

export const problems = pgTable("problems", {
  id: text("id").primaryKey(),
  // NULL — "своя" задача учителя, не привязана ни к одному навыку программы.
  skillId: text("skill_id").references(() => skills.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  answerType: answerTypeEnum("answer_type").notNull(),
  correctAnswer: text("correct_answer").notNull(),
  choices: jsonb("choices").$type<{ id: string; text: string }[] | null>(),
  diagram: jsonb("diagram").$type<Record<string, unknown> | null>(),
  keyFormula: text("key_formula"),
  hints: jsonb("hints").notNull().$type<string[]>(),
  explanation: text("explanation").notNull(),
  difficulty: integer("difficulty").notNull(),
  egeTaskNumber: integer("ege_task_number"),
  tier: tierEnum("tier"),
});

export const attempts = pgTable("attempts", {
  id: text("id").primaryKey(),
  studentId: text("student_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  problemId: text("problem_id")
    .notNull()
    .references(() => problems.id, { onDelete: "cascade" }),
  answer: text("answer").notNull(),
  isCorrect: boolean("is_correct").notNull(),
  source: attemptSourceEnum("source").notNull(),
  reviewStatus: reviewStatusEnum("review_status"),
  teacherFeedback: text("teacher_feedback"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const homeworks = pgTable("homeworks", {
  id: text("id").primaryKey(),
  // NULL у авторских пробников платформы (audience=pro_standalone).
  teacherId: text("teacher_id").references(() => users.id, { onDelete: "set null" }),
  studentId: text("student_id").references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  kind: assignmentKindEnum("kind").notNull(),
  allowHints: boolean("allow_hints").notNull(),
  timeLimitMinutes: integer("time_limit_minutes"),
  audience: audienceEnum("audience"),
  problemIds: jsonb("problem_ids").notNull().$type<string[]>(),
  dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const assignmentSessions = pgTable("assignment_sessions", {
  id: text("id").primaryKey(),
  homeworkId: text("homework_id")
    .notNull()
    .references(() => homeworks.id, { onDelete: "cascade" }),
  studentId: text("student_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
});

export const lessonLogs = pgTable("lesson_logs", {
  id: text("id").primaryKey(),
  teacherId: text("teacher_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  studentId: text("student_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  date: text("date").notNull(), // YYYY-MM-DD, храним как есть, не timestamp
  topic: text("topic").notNull(),
  report: text("report").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: notificationTypeEnum("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  link: text("link").notNull(),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------- SRS (интервальное повторение, коробки Лейтнера) ----------------
// Отдельная таблица от attempts: attempts — неизменяемый журнал всех попыток,
// а здесь — ТЕКУЩЕЕ состояние повторения для пары (ученик, задача): в какой
// "коробке" сейчас задача и когда её пора показать снова. Обновляется при
// каждой попытке с source IN ('lesson','review') — попытки из ДЗ/контрольных
// в SRS не участвуют (см. lib/actions-core.ts).
export const srsStates = pgTable(
  "srs_states",
  {
    studentId: text("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    problemId: text("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    box: integer("box").notNull().default(1), // 1..5, больше = реже повторяем
    reviewCount: integer("review_count").notNull().default(0),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }).notNull().defaultNow(),
    nextReviewAt: timestamp("next_review_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.studentId, t.problemId] }) })
);

// ---------------- Отношения (для удобного query API Drizzle) ----------------

export const usersRelations = relations(users, ({ many }) => ({
  attempts: many(attempts),
  notifications: many(notifications),
}));

export const skillsRelations = relations(skills, ({ one, many }) => ({
  subtopic: one(subtopics, { fields: [skills.subtopicId], references: [subtopics.id] }),
  problems: many(problems),
}));

export const problemsRelations = relations(problems, ({ one, many }) => ({
  skill: one(skills, { fields: [problems.skillId], references: [skills.id] }),
  attempts: many(attempts),
}));
