"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import {
  createSessionToken,
  setSessionCookie,
  clearSessionCookie,
  getSessionUser,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";
import {
  getProblem,
  getStudentsOfTeacher,
  getSkill,
  getProblemsForSkill,
  pushNotification,
  spendEnergy,
  isStandaloneStudent,
  getUserByEmail,
  genId,
} from "@/lib/queries";
import { performSubmitAttempt } from "@/lib/actions-core";
import { AssignmentKind, Role } from "@/lib/types";

// ---------- AUTH ----------

export async function loginAction(_prevState: unknown, formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  const user = await getUserByEmail(email);
  if (!user) return { error: "Пользователь с таким email не найден" };

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return { error: "Неверный пароль" };

  const token = await createSessionToken(user.id, user.role);
  await setSessionCookie(token);
  redirect(`/${user.role.toLowerCase()}`);
}

export async function logoutAction() {
  clearSessionCookie();
  redirect("/login");
}

// ---------- STUDENT: решение задач ----------

export async function submitAttemptAction(
  problemId: string,
  answer: string,
  source: "lesson" | "assignment" | "review"
) {
  const user = await getSessionUser();
  if (!user || user.role !== "STUDENT") {
    return { error: "Нужно войти как ученик" };
  }
  const result = await performSubmitAttempt(user, problemId, answer, source);
  if ("error" in result) return result;

  // /student ревалидируем только для урочных/pending попыток — там показан
  // счётчик прогресса и pending-задачи, которым важно быть свежими сразу.
  // Для "review" НЕ ревалидируем ничего: страница /student/review держит
  // список задач сессии в клиентском состоянии специально, чтобы можно было
  // показать "Верно!" и праздничную модалку — если протухнуть кэш прямо
  // сейчас, React перерендерит /student/review с сервера, где решённая
  // задача уже не входит в список due, и пользователь вместо этого увидит
  // пустое состояние "Повторять нечего", а не подтверждение и поздравление.
  if (source !== "review") {
    revalidatePath("/student");
  }
  if (result.kind === "pending") revalidatePath("/teacher");
  return result;
}

export async function revealSolutionAction(problemId: string) {
  const user = await getSessionUser();
  if (!user || user.role !== "STUDENT") return { error: "Нужно войти как ученик" };
  const problem = await getProblem(problemId);
  if (!problem) return { error: "Задача не найдена" };
  return { explanation: problem.explanation, correctAnswer: problem.correctAnswer };
}

// ---------- TEACHER: проверка развёрнутых решений ----------

export async function reviewAttemptAction(
  attemptId: string,
  decision: "approved" | "needs_revision",
  feedback: string
) {
  const teacher = await getSessionUser();
  if (!teacher || teacher.role !== "TEACHER") return { error: "Доступ запрещён" };

  const attemptRows = await db.select().from(schema.attempts).where(eq(schema.attempts.id, attemptId)).limit(1);
  const attempt = attemptRows[0];
  if (!attempt) return { error: "Попытка не найдена" };

  const students = await getStudentsOfTeacher(teacher.id);
  const studentIds = new Set(students.map((s) => s.id));
  if (!studentIds.has(attempt.studentId)) return { error: "Доступ запрещён" };

  const problem = await getProblem(attempt.problemId);
  const skill = problem?.skillId ? await getSkill(problem.skillId) : undefined;

  await db
    .update(schema.attempts)
    .set({
      reviewStatus: decision,
      isCorrect: decision === "approved",
      teacherFeedback: feedback || null,
    })
    .where(eq(schema.attempts.id, attemptId));

  await db.transaction(async (tx) => {
    await pushNotification(tx, {
      userId: attempt.studentId,
      type: "review_decided",
      title: decision === "approved" ? `Решение одобрено ✓` : `Решение нужно доработать`,
      body: `Навык «${skill?.title ?? ""}»${feedback ? `: ${feedback}` : ""}`,
      link: `/student`,
    });

    // Если одобрение делает навык полностью пройденным (и это была "урочная"
    // попытка) — так же уведомляем родителей, как и при обычном верном ответе.
    if (decision === "approved" && attempt.source === "lesson" && problem?.skillId) {
      const skillProblems = await getProblemsForSkill(problem.skillId);
      const skillProblemIds = new Set(skillProblems.map((p) => p.id));
      const lessonCorrect = await db
        .select({ problemId: schema.attempts.problemId })
        .from(schema.attempts)
        .where(
          and(
            eq(schema.attempts.studentId, attempt.studentId),
            eq(schema.attempts.isCorrect, true),
            eq(schema.attempts.source, "lesson")
          )
        );
      const solvedIds = new Set(
        lessonCorrect.filter((a) => skillProblemIds.has(a.problemId)).map((a) => a.problemId)
      );
      if (solvedIds.size === skillProblems.length && skillProblems.length > 0) {
        const parentLinks = await db
          .select()
          .from(schema.parentLinks)
          .where(eq(schema.parentLinks.studentId, attempt.studentId));
        const student = students.find((s) => s.id === attempt.studentId);
        for (const link of parentLinks) {
          await pushNotification(tx, {
            userId: link.parentId,
            type: "skill_completed",
            title: `${student?.name ?? "Ученик"} прошёл(а) навык «${skill?.title ?? ""}»`,
            body: `Все задачи навыка решены верно.`,
            link: `/parent/child/${attempt.studentId}`,
          });
        }
      }
    }
  });

  revalidatePath("/teacher");
  revalidatePath("/student");
  return { success: true };
}

// ---------- TEACHER: журнал занятий ----------

export async function createLessonLogAction(formData: FormData) {
  const teacher = await getSessionUser();
  const studentId = String(formData.get("studentId") || "");
  if (!teacher || teacher.role !== "TEACHER") {
    redirect(`/teacher/student/${studentId}?error=1`);
  }

  const date = String(formData.get("date") || "");
  const topic = String(formData.get("topic") || "").trim();
  const report = String(formData.get("report") || "").trim();

  if (!studentId || !date || !topic || !report) {
    redirect(`/teacher/student/${studentId}?error=1`);
  }

  const parentLinks = await db
    .select()
    .from(schema.parentLinks)
    .where(eq(schema.parentLinks.studentId, studentId));

  await db.transaction(async (tx) => {
    await tx.insert(schema.lessonLogs).values({
      id: genId("l"),
      teacherId: teacher.id,
      studentId,
      date,
      topic,
      report,
    });

    const bodyShort = report.length > 120 ? report.slice(0, 120) + "…" : report;
    await pushNotification(tx, {
      userId: studentId,
      type: "lesson_log_added",
      title: `Новая запись о занятии: ${topic}`,
      body: bodyShort,
      link: `/student`,
    });
    for (const link of parentLinks) {
      await pushNotification(tx, {
        userId: link.parentId,
        type: "lesson_log_added",
        title: `Новая запись о занятии: ${topic}`,
        body: bodyShort,
        link: `/parent/child/${studentId}`,
      });
    }
  });

  revalidatePath(`/teacher/student/${studentId}`);
  redirect(`/teacher/student/${studentId}`);
}

// ---------- TEACHER: управление учениками ----------

export async function addStudentAction(_prevState: unknown, formData: FormData) {
  const teacher = await getSessionUser();
  if (!teacher || teacher.role !== "TEACHER") return { error: "Доступ запрещён" };

  // До 3 учеников бесплатно, дальше — тариф репетитора (1499 ₽/мес).
  // Владелец платформы (isPlatformOwner) вне этого лимита вообще, как и
  // репетитор с активным teacherPlan='pro'. teacherProUntil===undefined
  // (выдано вручную из /admin бессрочно) тоже считается активным.
  const isTeacherProActive =
    teacher.teacherPlan === "pro" &&
    (!teacher.teacherProUntil || new Date(teacher.teacherProUntil).getTime() > Date.now());
  if (!teacher.isPlatformOwner && !isTeacherProActive) {
    const currentStudents = await getStudentsOfTeacher(teacher.id);
    if (currentStudents.length >= 3) {
      return {
        error:
          "На бесплатном тарифе можно добавить до 3 учеников. Чтобы добавить больше — оформите тариф репетитора.",
      };
    }
  }

  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "").trim() || "demo1234";
  const consent = formData.get("consent");

  if (!name || !email) return { error: "Заполните имя и email" };
  if (consent !== "on") {
    return { error: "Нужно подтвердить, что согласие ученика (или его представителя) получено" };
  }

  const existing = await getUserByEmail(email);
  if (existing) return { error: "Пользователь с таким email уже существует" };

  await db.insert(schema.users).values({
    id: genId("u"),
    name,
    email,
    passwordHash: await hashPassword(password),
    role: "STUDENT",
    teacherId: teacher.id,
    consentGivenAt: new Date(),
  });
  revalidatePath("/teacher");
  return { success: true, password };
}

export async function addParentLinkAction(_prevState: unknown, formData: FormData) {
  const teacher = await getSessionUser();
  if (!teacher || teacher.role !== "TEACHER") return { error: "Доступ запрещён" };

  const studentId = String(formData.get("studentId") || "");
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "").trim() || "demo1234";
  const consent = formData.get("consent");

  if (!name || !email || !studentId) return { error: "Заполните все поля" };
  if (consent !== "on") {
    return { error: "Нужно подтвердить, что согласие родителя получено" };
  }

  let parent = await getUserByEmail(email);
  if (parent && parent.role !== "PARENT") {
    return { error: "Этот email уже занят пользователем другой роли" };
  }
  if (!parent) {
    const id = genId("u");
    await db.insert(schema.users).values({
      id,
      name,
      email,
      passwordHash: await hashPassword(password),
      role: "PARENT",
      consentGivenAt: new Date(),
    });
    parent = { id, name, email, passwordHash: "", role: "PARENT", isAdmin: false, createdAt: new Date().toISOString() };
  }

  const alreadyLinked = await db
    .select()
    .from(schema.parentLinks)
    .where(and(eq(schema.parentLinks.parentId, parent.id), eq(schema.parentLinks.studentId, studentId)))
    .limit(1);
  if (alreadyLinked.length === 0) {
    await db.insert(schema.parentLinks).values({ parentId: parent.id, studentId });
  }
  revalidatePath(`/teacher/student/${studentId}`);
  return { success: true, password };
}

export async function createHomeworkAction(formData: FormData) {
  const teacher = await getSessionUser();
  const studentId = String(formData.get("studentId") || "");
  if (!teacher || teacher.role !== "TEACHER") {
    redirect(`/teacher/homework/new?studentId=${studentId}&error=1`);
  }

  const title = String(formData.get("title") || "").trim();
  const dueDate = String(formData.get("dueDate") || "");
  const bankProblemIds = formData.getAll("problemIds").map(String);
  const kind = (String(formData.get("kind") || "homework") as AssignmentKind);
  const allowHints = formData.get("allowHints") === "on";
  const timeLimitRaw = String(formData.get("timeLimitMinutes") || "").trim();
  const timeLimitMinutes = timeLimitRaw ? Math.max(1, parseInt(timeLimitRaw, 10)) : undefined;

  // Свои задачи, написанные учителем прямо в форме (не из банка навыков) —
  // создаём как обычные Problem без skillId, только для этого задания.
  type DraftProblem = {
    text: string;
    answerType: "NUMBER" | "DETAILED";
    correctAnswer: string;
    hint: string;
    explanation: string;
  };
  const customRaw = String(formData.get("customProblems") || "[]");
  let drafts: DraftProblem[] = [];
  try {
    drafts = (JSON.parse(customRaw) as DraftProblem[]).filter(
      (d) => d.text?.trim() && d.correctAnswer?.trim()
    );
  } catch {
    // некорректный JSON от клиента — просто игнорируем свои задачи, банк не трогаем
  }

  const problemIds = [...bankProblemIds, ...drafts.map(() => genId("p"))];
  const customProblemIds = problemIds.slice(bankProblemIds.length);

  if (!studentId || !title || !dueDate || problemIds.length === 0) {
    redirect(`/teacher/homework/new?studentId=${studentId}&error=1`);
  }

  const KIND_LABEL: Record<string, string> = {
    homework: "Новое домашнее задание",
    test: "Назначена контрольная работа",
    exam: "Назначен пробный экзамен",
  };

  await db.transaction(async (tx) => {
    for (let i = 0; i < drafts.length; i++) {
      const d = drafts[i];
      await tx.insert(schema.problems).values({
        id: customProblemIds[i],
        text: d.text.trim(),
        answerType: d.answerType === "DETAILED" ? "DETAILED" : "NUMBER",
        correctAnswer: d.correctAnswer.trim(),
        tier: "bank",
        hints: [d.hint?.trim() || "Внимательно перечитайте условие задачи ещё раз."],
        explanation: d.explanation?.trim() || d.correctAnswer.trim(),
        difficulty: 2,
      });
    }

    await tx.insert(schema.homeworks).values({
      id: genId("h"),
      teacherId: teacher.id,
      studentId,
      title,
      kind,
      allowHints,
      timeLimitMinutes: timeLimitMinutes ?? null,
      audience: "assigned",
      problemIds,
      dueDate: new Date(dueDate),
    });

    await pushNotification(tx, {
      userId: studentId,
      type: "assignment_created",
      title: KIND_LABEL[kind] ?? "Новое задание",
      body: title,
      link: `/student/homework`,
    });
  });

  revalidatePath(`/teacher/student/${studentId}`);
  redirect(`/teacher/student/${studentId}`);
}

// ---------- Уведомления ----------

export async function markNotificationReadAction(notificationId: string) {
  const user = await getSessionUser();
  if (!user) return { error: "Не авторизован" };
  await db
    .update(schema.notifications)
    .set({ read: true })
    .where(and(eq(schema.notifications.id, notificationId), eq(schema.notifications.userId, user.id)));
  return { success: true };
}

export async function markAllNotificationsReadAction() {
  const user = await getSessionUser();
  if (!user) return { error: "Не авторизован" };
  await db
    .update(schema.notifications)
    .set({ read: true })
    .where(eq(schema.notifications.userId, user.id));
  return { success: true };
}

// ---------- Публичная регистрация самостоятельных учеников ----------

export async function registerAction(_prevState: unknown, formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const consent = formData.get("consent");

  if (!name || !email || password.length < 6) {
    return { error: "Заполните имя, email и пароль (минимум 6 символов)" };
  }
  // Серверная проверка обязательна — клиентский required на чекбоксе легко
  // обойти прямым POST-запросом, минуя форму в браузере. Без согласия на
  // обработку персональных данных регистрация не должна проходить ни при
  // каких условиях (требование 152-ФЗ, см. app/legal/consent).
  if (consent !== "on") {
    return { error: "Нужно принять условия и дать согласие на обработку персональных данных" };
  }

  const existing = await getUserByEmail(email);
  if (existing) return { error: "Пользователь с таким email уже существует" };

  const userId = genId("u");
  await db.insert(schema.users).values({
    id: userId,
    name,
    email,
    passwordHash: await hashPassword(password),
    role: "STUDENT" as Role,
    consentGivenAt: new Date(),
    // teacherId сознательно не задаём — это самостоятельный пользователь.
    plan: "free",
    energy: 5,
    energyUpdatedAt: new Date(),
  });

  const token = await createSessionToken(userId, "STUDENT");
  await setSessionCookie(token);
  redirect("/student");
}

export async function registerTeacherAction(_prevState: unknown, formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const consent = formData.get("consent");

  if (!name || !email || password.length < 6) {
    return { error: "Заполните имя, email и пароль (минимум 6 символов)" };
  }
  if (consent !== "on") {
    return { error: "Нужно принять условия и дать согласие на обработку персональных данных" };
  }

  const existing = await getUserByEmail(email);
  if (existing) return { error: "Пользователь с таким email уже существует" };

  const userId = genId("u");
  await db.insert(schema.users).values({
    id: userId,
    name,
    email,
    passwordHash: await hashPassword(password),
    role: "TEACHER" as Role,
    consentGivenAt: new Date(),
    // teacherPlan по умолчанию 'free' — до 3 учеников бесплатно (лимит
    // проверяется в addStudentAction), дальше нужен платный тариф.
    // isPlatformOwner НЕ проставляем здесь никогда — этот флаг выдаётся
    // только вручную одному конкретному человеку (владельцу платформы)
    // через прямой SQL, см. README.
  });

  const token = await createSessionToken(userId, "TEACHER");
  await setSessionCookie(token);
  redirect("/teacher");
}

// ---------- План Free/Pro (демо-переключение, без реальной оплаты) ----------

export async function upgradeToProAction() {
  const user = await getSessionUser();
  if (!user || !isStandaloneStudent(user)) {
    redirect("/student");
  }
  await db.update(schema.users).set({ plan: "pro" }).where(eq(schema.users.id, user.id));
  revalidatePath("/student");
  redirect("/student");
}

export async function downgradeToFreeAction() {
  const user = await getSessionUser();
  if (!user || !isStandaloneStudent(user)) {
    redirect("/student");
  }
  await db
    .update(schema.users)
    .set({ plan: "free", energy: 5, energyUpdatedAt: new Date() })
    .where(eq(schema.users.id, user.id));
  revalidatePath("/student");
  redirect("/student");
}

// Требование Google Play User Data Policy для приложений с созданием
// аккаунта (см. app/legal/delete-account) — путь удаления должен быть
// доступен И в приложении, И на публичной веб-странице без входа.
// Сознательно НЕ мгновенное каскадное удаление — это боевая база с
// реальными пользователями, полное удаление затрагивает много связанных
// таблиц (попытки, платежи, привязки родитель-ребёнок). Помечаем запрос
// для ручной обработки владельцем, гарантированный срок — на публичной
// странице.
export async function requestAccountDeletionAction() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  await db
    .update(schema.users)
    .set({ deletionRequestedAt: new Date() })
    .where(eq(schema.users.id, user.id));
  revalidatePath("/student/profile");
  revalidatePath("/admin");
}

export async function cancelAccountDeletionAction() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  await db
    .update(schema.users)
    .set({ deletionRequestedAt: null })
    .where(eq(schema.users.id, user.id));
  revalidatePath("/student/profile");
  revalidatePath("/admin");
}
