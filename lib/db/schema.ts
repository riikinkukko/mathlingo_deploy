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
  // Когда истекает текущий оплаченный период Pro (NULL — не оплачивалось
  // никогда, либо план назначен вручную администратором бессрочно).
  // Реальная оплата — разовая за период (месяц), не автосписание: ЮKassa
  // требует отдельного согласования для рекуррентных платежей.
  proUntil: timestamp("pro_until", { withTimezone: true }),
  // Ручное управление подпиской из admin-панели, в обход оплаты — на случай
  // проблем с платежами/поддержкой. НЕ то же самое, что plan='pro' сам по
  // себе — просто отдельный, явный флаг "выдано вручную", виден в панели.
  isAdmin: boolean("is_admin").notNull().default(false),
  // Telegram-уведомления — необязательная привязка. chatId появляется
  // после того, как пользователь перешёл по t.me-ссылке и нажал "Старт" у
  // бота (боты не могут писать первыми — таковы правила Telegram).
  // linkCode — одноразовый код на время самой привязки, обнуляется сразу
  // после успешного связывания.
  telegramChatId: text("telegram_chat_id"),
  telegramLinkCode: text("telegram_link_code"),
  // Момент, когда пользователь принял Пользовательское соглашение и дал
  // согласие на обработку персональных данных (checkbox при регистрации,
  // см. app/register/RegisterForm.tsx). NULL у пользователей, созданных ДО
  // введения этого поля (учеников/родителей, которых добавил репетитор
  // напрямую, минуя форму регистрации) — по 152-ФЗ согласие в таком случае
  // на практике даёт репетитор от имени/по договорённости с учеником при
  // очном заключении договора на занятия, эта запись это не заменяет.
  consentGivenAt: timestamp("consent_given_at", { withTimezone: true }),
  // Подтверждение email — NULL означает "не подтверждён". Намеренно НЕ
  // блокирует доступ к сервису (мягкий подход для старта, не жёсткий
  // gate) — просто позволяет показать напоминание в интерфейсе и
  // отдельно снижает риск регистрации на чужой/несуществующий адрес.
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  // Запрос на удаление аккаунта (требование Google Play User Data Policy
  // для приложений с созданием аккаунта — см. app/legal/delete-account).
  // Сознательно НЕ автоматическое каскадное удаление по нажатию кнопки —
  // это боевая продакшен-база с реальными пользователями, а полное
  // удаление затрагивает много связанных таблиц (попытки, платежи,
  // привязки родитель-ребёнок). Вместо этого — пометка для ручной
  // обработки владельцем через /admin, с гарантией удаления в разумный
  // срок (см. текст на публичной странице запроса).
  deletionRequestedAt: timestamp("deletion_requested_at", { withTimezone: true }),
  // --- Тариф репетитора (не путать с plan выше — тот только для
  // самостоятельного ученика). До 3 учеников бесплатно, дальше нужен
  // teacherPlan='pro'. NULL/по умолчанию 'free' у всех существующих
  // репетиторов — сознательно НЕ ломает уже работающих учителей задним
  // числом, лимит применяется только при попытке добавить НОВОГО ученика
  // сверх трёх (см. addStudentAction в app/actions.ts).
  teacherPlan: planEnum("teacher_plan").notNull().default("free"),
  teacherProUntil: timestamp("teacher_pro_until", { withTimezone: true }),
  // Владелец платформы (вы) — полностью вне обычной системы тарифов, а
  // не просто "вечный Pro": лимит на учеников для него не проверяется
  // вообще, ни при каких условиях. Отдельно от isAdmin (тот — про доступ
  // к /admin, это — про коммерческие ограничения; у вас оба true, но
  // технически это разные вещи на случай будущих сценариев).
  isPlatformOwner: boolean("is_platform_owner").notNull().default(false),
  // Сохранённый способ оплаты ЮKassa для автоматических ежемесячных
  // списаний тарифа репетитора (payment_method_id из ответа ЮKassa после
  // первого платежа с save_payment_method:true). NULL — автосписание не
  // настроено (ещё не платил, либо отменил автоплатёж).
  yookassaPaymentMethodId: text("yookassa_payment_method_id"),
  // Показываем пользователю, ЧТО именно отвязывается при отмене (как
  // "VISA •••• 4567") — требование ЮKassa при согласовании автоплатежей:
  // должен быть самостоятельный интерфейс отмены, не просто факт наличия
  // функции в коде. Не хранит номер карты целиком — только то, что и так
  // возвращает ЮKassa как маскированные метаданные, не платёжные данные.
  yookassaCardLast4: text("yookassa_card_last4"),
  yookassaCardType: text("yookassa_card_type"), // "Visa" | "MasterCard" | "Мир" и т.п.
  // Онбординг для самостоятельных учеников (не заполняется у учеников
  // репетитора автоматически — тот подбирает материал сам) — влияет на
  // РЕАЛЬНЫЙ порядок и доступность тем на дашборде и странице предметов,
  // не просто хранится для отчётности. См. lib/curriculum-recommendations.ts.
  grade: integer("grade"), // 7-11, null — не заполнено (ученики репетитора, старые аккаунты)
  targetScore: integer("target_score"), // цель по баллам ЕГЭ, 0-100
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Анти-абуз: попытки регистрации по IP-адресу — по отзыву внешнего
// ревью, без этого легко создать 10 бесплатных аккаунтов репетитора
// (3 ученика × 10 = 30 бесплатных мест вместо честного лимита) или
// плодить новые ученические аккаунты ради свежей дневной энергии.
// Отдельная таблица, не поле у users — считаем ЛЮБУЮ попытку (включая
// неудачные — email уже занят, чекбокс не отмечен), иначе бот просто
// перебирал бы email-адреса с одного IP без ограничений. Персистентно в
// БД, не in-memory — сервер регулярно перезапускается при деплое, и
// in-memory счётчик обнулялся бы почти сразу после каждого обновления.
export const registrationAttempts = pgTable("registration_attempts", {
  id: text("id").primaryKey(),
  ipAddress: text("ip_address").notNull(),
  role: text("role").notNull(), // "STUDENT" | "TEACHER" — лимиты считаются раздельно
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Одноразовые токены — и для подтверждения email, и для сброса пароля.
// Одна таблица с полем type, а не две похожие — структура одинаковая
// (случайный токен, срок действия, факт использования), незачем
// дублировать. token — длинная случайная строка (см. genId), не
// последовательный ID — иначе можно было бы перебором подобрать чужой.
export const authTokens = pgTable("auth_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  type: text("type").notNull(), // "email_verification" | "password_reset"
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  // NULL — токен ещё не использован. Заполняется при успешном
  // использовании — не даёт применить одну и ту же ссылку из письма
  // дважды (особенно важно для сброса пароля).
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// История платежей через ЮKassa — не только для сверки, но и источник
// истины при обработке вебхука (идемпотентность: один и тот же вебхук,
// доставленный повторно, не должен продлить подписку дважды).
export const payments = pgTable("payments", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  yookassaPaymentId: text("yookassa_payment_id").notNull().unique(),
  amountRub: integer("amount_rub").notNull(),
  status: text("status").notNull(), // pending | succeeded | canceled
  periodDays: integer("period_days").notNull(),
  // Кому и что продлевать при успехе — ученику (plan/proUntil) или
  // репетитору (teacherPlan/teacherProUntil). default для обратной
  // совместимости со старыми записями (все они были student_pro).
  paymentType: text("payment_type").notNull().default("student_pro"), // student_pro | teacher_pro
  // true — при этом платеже способ оплаты был сохранён для будущих
  // автосписаний (см. users.yookassaPaymentMethodId). false для разовых
  // ученических Pro-платежей и для платежей без явного согласия на автоплатёж.
  isRecurringSetup: boolean("is_recurring_setup").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
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
