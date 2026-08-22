export type Role = "STUDENT" | "TEACHER" | "PARENT";
export type Plan = "free" | "pro";

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  // Для ученика: id репетитора, который его ведёт. Если не задан — это
  // самостоятельный пользователь (зарегистрировался сам, не чей-то ученик),
  // на него распространяется система планов Free/Pro и энергии ниже.
  teacherId?: string;
  // Только для самостоятельных учеников (role=STUDENT, teacherId не задан).
  // Ученики с репетитором эквивалентны Pro автоматически — план на них не
  // распространяется вовсе.
  plan?: Plan; // по умолчанию "free" при регистрации
  energy?: number; // текущий запас энергии (Free-план)
  energyUpdatedAt?: string; // когда energy последний раз пересчитывалась/тратилась
  // Когда истекает текущий оплаченный (или вручную выданный) период Pro.
  proUntil?: string;
  // Доступ к /admin — ручное управление подписками, если возникли проблемы
  // с оплатой. Не путать с ролью TEACHER — это отдельная, ортогональная вещь.
  isAdmin?: boolean;
  telegramChatId?: string;
  telegramLinkCode?: string;
  createdAt: string;
}

// Связь родитель <-> ученик (многие ко многим)
export interface ParentLink {
  parentId: string;
  studentId: string;
}

// NUMBER/CHOICE проверяются автоматически. DETAILED — открытый ответ
// (подробное решение), автоматически не проверяется, уходит на ревью учителю.
export type AnswerType = "NUMBER" | "CHOICE" | "DETAILED";

export interface Problem {
  id: string;
  // Не задан для "своих" задач, которые учитель написал прямо при создании
  // домашки/контрольной (не из банка навыков) — они не входят ни в один
  // навык программы и не показываются в дереве обучения ученика.
  skillId?: string;
  text: string;
  answerType: AnswerType;
  correctAnswer: string; // для DETAILED — эталонное решение для учителя, не для сверки
  choices?: { id: string; text: string }[];
  diagram?: DiagramSpec; // схематичная иллюстрация (не в масштабе, как на реальном ЕГЭ)
  keyFormula?: string; // формула-подсказка, доступна сразу, без ограничений по попыткам
  // Подсказки без ответа: [0] — концептуальная, [1] — более конкретная.
  // Показываются по нарастающей при повторных неверных попытках.
  hints: string[];
  explanation: string; // полный разбор
  difficulty: 1 | 2 | 3;
  egeTaskNumber?: number;
  // "core" — входит в обычный урок (LessonFlow) по умолчанию; "bank" — есть
  // в общем банке задач навыка (доступна для ДЗ/контрольных через конструктор
  // задания у учителя), но не показывается в самом уроке, чтобы урок
  // оставался компактным даже при большом банке задач по теме.
  tier?: "core" | "bank";
}

// То, что можно безопасно передавать в клиентские компоненты ДО решения
// задачи ученику — без ответа, без подсказок, без разбора.
export type PublicProblem = Omit<Problem, "correctAnswer" | "hints" | "explanation">;

export interface SolvedInfo {
  explanation: string;
  correctAnswer: string;
}

export interface TheoryCard {
  title: string;
  formula?: string;
  body: string;
  diagram?: DiagramSpec;
}

// Параметры для параметрических SVG-диаграмм (см. components/diagrams).
export interface DiagramSpec {
  kind:
    | "triangleAngles"
    | "triangleRight"
    | "triangleCevian"
    | "triangleSimilarPair"
    | "triangleSides"
    | "triangleExteriorAngle"
    | "rectangle"
    | "parallelogram"
    | "trapezoid"
    | "circle"
    | "unitCircle"
    | "vectorPlane"
    | "box"
    | "pyramid"
    | "cylinder"
    | "cone"
    | "triangularPrism"
    | "functionGraph"
    | "qualitativeCurve";
  [key: string]: unknown;
}

export interface Topic {
  id: string;
  order: number;
  title: string;
}

// "Глава" учебной программы, напр. «Треугольники» — группирует несколько
// сфокусированных навыков (Skill). Сама по себе теории/задач не содержит.
export interface Subtopic {
  id: string;
  topicId: string;
  order: number;
  title: string;
}

// Конкретный сфокусированный навык-урок, напр. «Теорема Пифагора» —
// это и есть тот уровень, на котором лежат теория и задачи.
export interface Skill {
  id: string;
  subtopicId: string;
  order: number;
  title: string;
  theoryCards: TheoryCard[];
}

export interface Attempt {
  id: string;
  studentId: string;
  problemId: string;
  answer: string;
  isCorrect: boolean;
  // Откуда пришла попытка: "lesson" — из обычного прохождения навыка (только
  // это двигает прогресс по пути обучения и разблокирует следующие навыки),
  // "assignment" — из домашки/контрольной/пробника (засчитывается для самого
  // задания и в XP, но НЕ продвигает и не открывает путь обучения — иначе
  // ученик мог бы "пройти" ещё не открытую тему в обход преподавателя).
  // "review" — попытка в рамках интервального повторения (SRS), см. lib/queries.ts
  source: "lesson" | "assignment" | "review";
  // Только для DETAILED-задач: развёрнутое решение ждёт проверки учителем
  // ("pending"/"approved"/"needs_revision"), либо, если у ученика нет
  // учителя (самостоятельный), сразу засчитывается с раскрытием эталонного
  // решения для самопроверки ("self_checked") — проверять всё равно некому.
  reviewStatus?: "pending" | "approved" | "needs_revision" | "self_checked";
  teacherFeedback?: string;
  createdAt: string;
}

export type AssignmentKind = "homework" | "test" | "exam";

export interface Homework {
  id: string;
  teacherId?: string; // не задан для "авторских" пробников от платформы
  studentId?: string; // не задан для общих Pro-пробников (audience="pro_standalone")
  title: string;
  kind: AssignmentKind;
  allowHints: boolean; // false — экзаменационный режим: без подсказок и разбора до сдачи
  timeLimitMinutes?: number; // если задан — на странице задания идёт обратный отсчёт
  // "assigned" — обычное персональное задание от репетитора конкретному ученику.
  // "pro_standalone" — авторский пробник платформы, доступен всем самостоятельным
  // ученикам с Pro-планом (не привязан к конкретному studentId).
  audience?: "assigned" | "pro_standalone";
  problemIds: string[];
  dueDate: string;
  createdAt: string;
}

// Момент начала прохождения конкретного задания конкретным учеником —
// нужен, чтобы таймер не сбрасывался при обновлении страницы.
export interface AssignmentSession {
  id: string;
  homeworkId: string;
  studentId: string;
  startedAt: string;
}

// Запись о занятии — тьютор ведёт журнал: что прошли, каков прогресс.
// Видна ученику и родителю в режиме чтения.
export interface LessonLog {
  id: string;
  teacherId: string;
  studentId: string;
  date: string; // дата занятия (YYYY-MM-DD)
  topic: string; // напр. "Неравенства"
  report: string; // подробный отчёт о занятии
  createdAt: string;
}

export type NotificationType =
  | "assignment_created"
  | "lesson_log_added"
  | "review_decided"
  | "review_pending"
  | "skill_completed";

export interface Notification {
  id: string;
  userId: string; // кому предназначено
  type: NotificationType;
  title: string;
  body: string;
  link: string; // куда вести по клику
  read: boolean;
  createdAt: string;
}

// Запись о платеже через ЮKassa — история + источник истины для
// идемпотентной обработки вебхука (см. markPaymentSucceeded в queries.ts).
export interface Payment {
  id: string;
  userId: string;
  yookassaPaymentId: string;
  amountRub: number;
  status: "pending" | "succeeded" | "canceled";
  periodDays: number;
  createdAt: string;
  paidAt?: string;
}

export interface DB {
  users: User[];
  parentLinks: ParentLink[];
  topics: Topic[];
  subtopics: Subtopic[];
  skills: Skill[];
  problems: Problem[];
  attempts: Attempt[];
  homeworks: Homework[];
  assignmentSessions: AssignmentSession[];
  lessonLogs: LessonLog[];
  notifications: Notification[];
}
