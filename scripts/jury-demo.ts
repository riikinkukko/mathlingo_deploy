// Демо-аккаунты для жюри конкурсов и для показов: учитель, три ученика и
// родитель с живыми данными — прогресс, проверенные решения с фото, домашние
// задания, журнал занятий, расписание, оплаты, пробники.
//
// Запуск на сервере (после `npm run seed`, чтобы банк задач был на месте):
//   npm run jury:demo
// Повторный запуск удаляет прежние демо-аккаунты и создаёт их заново —
// так можно «почистить» демо после того, как в нём кто-то порешал задачи.
// Реальных пользователей скрипт не трогает: удаляются только адреса ниже.
// Пароль — JURY_PASSWORD из окружения или пароль по умолчанию.
import { config } from "dotenv";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import bcrypt from "bcryptjs";

config({ path: path.join(__dirname, "..", ".env.local") });

const EMAILS = {
  teacher: "jury-teacher@planimetrika.online",
  student: "jury-student@planimetrika.online",
  student2: "jury-student2@planimetrika.online",
  student3: "jury-student3@planimetrika.online",
  parent: "jury-parent@planimetrika.online",
};
const PASSWORD = process.env.JURY_PASSWORD || "jury2026";

const DAY = 86_400_000;
const id = (p: string) => `${p}_jury_${crypto.randomBytes(6).toString("hex")}`;
const ago = (days: number, hours = 0) => new Date(Date.now() - days * DAY - hours * 3_600_000);
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const img = (name: string) =>
  "data:image/jpeg;base64," + fs.readFileSync(path.join(__dirname, "assets", name)).toString("base64");

async function main() {
  const { db } = await import("../lib/db/client");
  const schema = await import("../lib/db/schema");
  const { inArray, sql } = await import("drizzle-orm");

  // Банк задач в порядке программы: тема → глава → навык → задача.
  const rows = (
    await db.execute(sql`
      select p.id, p.answer_type as "answerType", p.correct_answer as "correctAnswer",
             coalesce(p.tier, 'core') as tier, k.id as "skillId", k.title as "skillTitle", t."order" as "topicOrder"
      from problems p
      join skills k on k.id = p.skill_id
      join subtopics s on s.id = k.subtopic_id
      join topics t on t.id = s.topic_id
      order by t."order", s."order", k."order", length(p.id), p.id
    `)
  ).rows as { id: string; answerType: string; correctAnswer: string; tier: string; skillId: string; skillTitle: string; topicOrder: number }[];
  if (rows.length === 0) throw new Error("Банк задач пуст — сначала выполните npm run seed");

  type P = (typeof rows)[number];
  const skills: { id: string; title: string; topicOrder: number; core: P[]; bank: P[] }[] = [];
  for (const r of rows) {
    let s = skills.find((x) => x.id === r.skillId);
    if (!s) skills.push((s = { id: r.skillId, title: r.skillTitle, topicOrder: r.topicOrder, core: [], bank: [] }));
    (r.tier === "core" ? s.core : s.bank).push(r);
  }
  const topicOrders = Array.from(new Set(skills.map((s) => s.topicOrder)));
  const ofTopic = (i: number) => skills.filter((s) => s.topicOrder === topicOrders[i]);
  const plan = ofTopic(0); // планиметрия
  const prob = ofTopic(1); // теория вероятностей
  const byId = new Map(rows.map((r) => [r.id, r]));

  // ---------- Чистим прежнее демо ----------
  const old = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(inArray(schema.users.email, Object.values(EMAILS)));
  if (old.length) {
    await db.delete(schema.users).where(inArray(schema.users.id, old.map((u) => u.id)));
    console.log(`Удалено прежних демо-аккаунтов: ${old.length}`);
  }

  const hash = await bcrypt.hash(PASSWORD, 10);
  const now = new Date();
  const teacherId = id("u");
  const s1 = id("u");
  const s2 = id("u");
  const s3 = id("u");
  const parentId = id("u");
  const base = { passwordHash: hash, consentGivenAt: now, emailVerifiedAt: now };

  await db.insert(schema.users).values([
    {
      id: teacherId, ...base, name: "Елена Сергеевна Миронова", email: EMAILS.teacher, role: "TEACHER",
      paymentInstructions: "Перевод по номеру телефона, в комментарии — имя ученика.",
      createdAt: ago(40),
    },
    {
      id: s1, ...base, name: "Алина Смирнова", email: EMAILS.student, role: "STUDENT", teacherId,
      grade: 11, targetScore: 85, dreamUniversity: "ННГУ им. Лобачевского",
      lessonPriceRub: 1500, paymentRemindersEnabled: true, createdAt: ago(35),
    },
    {
      id: s2, ...base, name: "Тимур Абрамов", email: EMAILS.student2, role: "STUDENT", teacherId,
      grade: 11, targetScore: 70, lessonPriceRub: 1500, paymentRemindersEnabled: true, createdAt: ago(30),
    },
    {
      id: s3, ...base, name: "Вера Кузнецова", email: EMAILS.student3, role: "STUDENT", teacherId,
      grade: 10, targetScore: 80, lessonPriceRub: 1500, createdAt: ago(12),
    },
    { id: parentId, ...base, name: "Ольга Смирнова", email: EMAILS.parent, role: "PARENT", createdAt: ago(34) },
  ]);
  await db.insert(schema.parentLinks).values({ parentId, studentId: s1 });

  // ---------- Решения ----------
  type A = typeof schema.attempts.$inferInsert;
  const attempts: A[] = [];
  const images: (typeof schema.attemptImages.$inferInsert)[] = [];
  const feedback = [
    "Решение верное, оформление аккуратное. Не забывай подписывать, из какого треугольника берёшь теорему.",
    "Хорошо! Ход решения понятен, ответ верный.",
    "Верно. Можно короче: сразу через формулу площади.",
  ];
  /** Пройти навыки: все задачи основного урока, развёрнутые — проверены учителем. */
  function solve(studentId: string, list: typeof skills, fromDay: number, toDay: number) {
    const all = list.flatMap((s) => s.core);
    all.forEach((p, i) => {
      const day = Math.round(fromDay - ((fromDay - toDay) * i) / Math.max(1, all.length - 1));
      const createdAt = ago(day, 2 + (i % 5));
      if (p.answerType === "DETAILED") {
        attempts.push({
          id: id("a"), studentId, problemId: p.id, answer: "Решение на фото", isCorrect: true, source: "lesson",
          reviewStatus: "approved", teacherFeedback: feedback[i % feedback.length], createdAt,
        });
      } else {
        // Иногда — сначала ошибка, потом верный ответ: так видна работа над ошибками.
        if (i % 7 === 3) {
          attempts.push({ id: id("a"), studentId, problemId: p.id, answer: "1", isCorrect: false, source: "lesson", createdAt: new Date(createdAt.getTime() - 600_000) });
        }
        attempts.push({ id: id("a"), studentId, problemId: p.id, answer: p.correctAnswer, isCorrect: true, source: "lesson", createdAt });
      }
    });
  }

  // Алина: 10 навыков планиметрии и 4 — вероятности, занимается каждый день.
  solve(s1, plan.slice(0, 10), 30, 3);
  solve(s1, prob.slice(0, 4), 12, 0);
  // Тимур: 6 навыков планиметрии, 2 — вероятности, последний раз 3 дня назад.
  solve(s2, plan.slice(0, 6), 25, 5);
  solve(s2, prob.slice(0, 2), 6, 3);
  // Вера: только начала.
  solve(s3, plan.slice(0, 2), 9, 1);

  // Алина: решения с фото — одно проверено с пометками, одно ждёт проверки.
  const withPhoto = (pid: string) => byId.get(pid) ?? rows.find((r) => r.answerType === "DETAILED" && r.topicOrder === topicOrders[0])!;
  const rect = withPhoto("p_60");
  const trap = withPhoto("p_93");
  for (let i = attempts.length - 1; i >= 0; i--) {
    if (attempts[i].studentId === s1 && (attempts[i].problemId === rect.id || attempts[i].problemId === trap.id)) attempts.splice(i, 1);
  }
  const rectId = id("a");
  attempts.push({
    id: rectId, studentId: s1, problemId: rect.id, answer: "Решение на фото", isCorrect: true, source: "lesson",
    reviewStatus: "approved", teacherFeedback: "Верно и аккуратно! Отметила ответ — так и оформляй на экзамене.", createdAt: ago(4, 3),
  });
  images.push({ attemptId: rectId, data: img("jury-solution-rect.jpg"), annotated: img("jury-solution-rect-marked.jpg") });
  const trapId = id("a");
  attempts.push({
    id: trapId, studentId: s1, problemId: trap.id, answer: "Решение на фото", isCorrect: false, source: "lesson",
    reviewStatus: "pending", createdAt: ago(0, 1),
  });
  images.push({ attemptId: trapId, data: img("jury-solution-trapezoid.jpg") });

  // Вера: решение отправлено на доработку.
  const veraDet = plan.slice(0, 4).flatMap((s) => s.core).find((p) => p.answerType === "DETAILED" && !attempts.some((a) => a.studentId === s3 && a.problemId === p.id));
  if (veraDet) {
    attempts.push({
      id: id("a"), studentId: s3, problemId: veraDet.id, answer: "Ответ получила, но не объяснила, почему углы равны.", isCorrect: false,
      source: "lesson", reviewStatus: "needs_revision",
      teacherFeedback: "Ответ верный, но не хватает обоснования: почему эти углы равны? Допиши одну строчку — и будет полный балл.",
      createdAt: ago(1, 4),
    });
  }

  // ---------- Задания ----------
  const hw: (typeof schema.homeworks.$inferInsert)[] = [];
  const nextSkill = plan[10] ?? plan[plan.length - 1];
  hw.push({
    id: id("h"), teacherId, studentId: s1, title: nextSkill.title, kind: "homework", allowHints: true,
    audience: "assigned", problemIds: [...nextSkill.core, ...nextSkill.bank].slice(0, 6).map((p) => p.id),
    dueDate: new Date(Date.now() + 4 * DAY), createdAt: ago(1),
  });
  // Контрольная, которую Алина уже сдала.
  const testIds = plan.slice(2, 5).flatMap((s) => s.bank.filter((p) => p.answerType !== "DETAILED").slice(0, 2)).map((p) => p.id);
  const testId = id("h");
  hw.push({
    id: testId, teacherId, studentId: s1, title: "Контрольная: треугольники", kind: "test", allowHints: false,
    timeLimitMinutes: 40, audience: "assigned", problemIds: testIds, dueDate: ago(8), createdAt: ago(14),
  });
  testIds.forEach((pid, i) => {
    const p = byId.get(pid)!;
    attempts.push({ id: id("a"), studentId: s1, problemId: pid, answer: p.correctAnswer, isCorrect: true, source: "assignment", createdAt: new Date(ago(10, 1).getTime() + i * 180_000) });
  });
  // Пробник для Тимура — ещё не начат.
  const examIds = plan.slice(0, 8).map((s) => s.bank.find((p) => p.answerType !== "DETAILED") ?? s.core[0]).filter(Boolean).map((p) => p!.id);
  hw.push({
    id: id("h"), teacherId, studentId: s2, title: "Пробник: первая часть, геометрия", kind: "exam", allowHints: false,
    timeLimitMinutes: 60, audience: "assigned", problemIds: examIds, dueDate: new Date(Date.now() + 7 * DAY), createdAt: ago(2),
  });

  // Группа «11 класс, профиль» и общее задание.
  const groupId = id("g");
  await db.insert(schema.studentGroups).values({ id: groupId, teacherId, name: "11 «А», профильная математика", createdAt: ago(20) });
  await db.insert(schema.studentGroupMembers).values([s1, s2, s3].map((studentId) => ({ groupId, studentId })));
  const batchId = id("hb");
  const groupIds = (prob[0]?.core ?? []).concat(prob[1]?.core ?? []).filter((p) => p.answerType !== "DETAILED").slice(0, 6).map((p) => p.id);
  for (const studentId of [s1, s2, s3]) {
    hw.push({
      id: id("h"), teacherId, studentId, title: "Классная работа: вероятность", kind: "homework", allowHints: true,
      audience: "assigned", problemIds: groupIds, dueDate: new Date(Date.now() + 6 * DAY), groupId, batchId, createdAt: ago(3),
    });
  }
  await db.insert(schema.homeworks).values(hw);
  await db.insert(schema.assignmentSessions).values({ id: id("as"), homeworkId: testId, studentId: s1, startedAt: new Date(ago(10, 1).getTime() - 300_000) });

  for (let i = 0; i < attempts.length; i += 500) await db.insert(schema.attempts).values(attempts.slice(i, i + 500));
  await db.insert(schema.attemptImages).values(images);

  // Повторение: часть решённых задач Алины уже пора повторить.
  const srs = attempts
    .filter((a) => a.studentId === s1 && a.isCorrect && a.source === "lesson" && !a.reviewStatus)
    .slice(0, 12)
    .map((a, i) => ({
      studentId: s1, problemId: a.problemId, box: 1 + (i % 3), reviewCount: i % 3,
      lastReviewedAt: a.createdAt as Date, nextReviewAt: i % 2 ? ago(1) : new Date(Date.now() + 3 * DAY),
    }));
  if (srs.length) await db.insert(schema.srsStates).values(srs).onConflictDoNothing();

  // Уведомления ученику: решение проверено, новое задание.
  await db.insert(schema.notifications).values([
    {
      id: id("n"), userId: s1, type: "review_decided", title: "Решение одобрено ✓",
      body: "Навык «" + (byId.get(rect.id)?.skillTitle ?? "") + "»: Верно и аккуратно! · есть пометки на фото",
      link: "/student/skill/" + (byId.get(rect.id)?.skillId ?? ""), createdAt: ago(4, 1),
    },
    {
      id: id("n"), userId: s1, type: "assignment_created", title: "Домашнее задание",
      body: `Домашнее задание: ${nextSkill.title}`, link: "/student/homework", createdAt: ago(1),
    },
  ]);

  // ---------- Занятия, журнал, оплаты, пробники ----------
  const lessons: (typeof schema.scheduledLessons.$inferInsert)[] = [];
  const weekly = (studentId: string, past: number, future: number, hour: number) => {
    for (let w = past; w >= 1; w--) {
      const d = ago(w * 7); d.setUTCHours(hour - 3, 0, 0, 0);
      lessons.push({ id: id("sl"), teacherId, studentId, startsAt: d, durationMin: 60, status: "done", priceRub: 1500 });
    }
    for (let w = 0; w < future; w++) {
      const d = new Date(Date.now() + (2 + w * 7) * DAY); d.setUTCHours(hour - 3, 0, 0, 0);
      lessons.push({ id: id("sl"), teacherId, studentId, startsAt: d, durationMin: 60, status: "planned" });
    }
  };
  weekly(s1, 5, 3, 17);
  weekly(s2, 4, 3, 18);
  weekly(s3, 1, 3, 16);
  await db.insert(schema.scheduledLessons).values(lessons);

  await db.insert(schema.lessonLogs).values([
    {
      id: id("l"), teacherId, studentId: s1, date: ymd(ago(14)), topic: "Подобие треугольников",
      report: "Разобрали признаки подобия и отношение площадей подобных фигур. Алина уверенно находит подобные треугольники на чертеже, но путает, какие стороны соответственные. Договорились подписывать равные углы дугами. Задано: навык «Подобие» на платформе.",
      createdAt: ago(14),
    },
    {
      id: id("l"), teacherId, studentId: s1, date: ymd(ago(7)), topic: "Теорема синусов и косинусов",
      report: "Вывели теорему косинусов, решили 6 задач из первой части. Ошибки только арифметические. Начали задачу №18 с полным оформлением — дома дописать и отправить фото решения.",
      createdAt: ago(7),
    },
    {
      id: id("l"), teacherId, studentId: s2, date: ymd(ago(7)), topic: "Площади четырёхугольников",
      report: "Повторили формулы площадей. Тимур решает быстро, но пропускает проверку ответа. На следующем занятии — пробник по первой части.",
      createdAt: ago(7),
    },
  ]);

  await db.insert(schema.studentPayments).values([
    { id: id("sp"), teacherId, studentId: s1, amountRub: 6000, lessonsCount: 4, paidAt: ymd(ago(33)), note: "Абонемент на 4 занятия" },
    { id: id("sp"), teacherId, studentId: s2, amountRub: 6000, lessonsCount: 4, paidAt: ymd(ago(29)), note: "Абонемент на 4 занятия" },
    { id: id("sp"), teacherId, studentId: s3, amountRub: 3000, lessonsCount: 2, paidAt: ymd(ago(10)) },
  ]);

  await db.insert(schema.mockScores).values([
    { id: id("ms"), teacherId, studentId: s1, score: 62, takenAt: ymd(ago(30)), note: "Стартовая диагностика" },
    { id: id("ms"), teacherId, studentId: s1, score: 68, takenAt: ymd(ago(16)) },
    { id: id("ms"), teacherId, studentId: s1, score: 74, takenAt: ymd(ago(2)), note: "Школьный пробник" },
    { id: id("ms"), teacherId, studentId: s2, score: 56, takenAt: ymd(ago(20)) },
  ]);
  await db.insert(schema.studentNotes).values({
    studentId: s1, teacherId,
    notes: "Цель — 85+. Сильная сторона — планиметрия. Слабая — арифметика под временем. Мама просит отчёт после каждого занятия.",
  });

  console.log("\nДемо-аккаунты готовы (пароль у всех один):", PASSWORD);
  console.log("  Учитель:  ", EMAILS.teacher, "— 3 ученика, группа, расписание, оплаты, решение ждёт проверки");
  console.log("  Ученик:   ", EMAILS.student, "— 14 пройденных навыков, проверенное решение с пометками, ДЗ");
  console.log("  Родитель: ", EMAILS.parent, "— видит Алину Смирнову");
  console.log("  Ещё ученики:", EMAILS.student2, EMAILS.student3);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
