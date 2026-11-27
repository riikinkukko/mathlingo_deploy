"use server";


import { getTemplate, saveTemplate } from "@/lib/templates";
import { onAttemptReviewed } from "@/lib/mock-queries";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { eq, and, gt, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import {
  passwordCredentialVersion,
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
  getUserById,
  canStudentAccessProblem,
  getHomeworksForStudent,
  isMailboxTakenBySelfRegisteredAccount,
  genId,
  createAuthToken,
  consumeAuthToken,
  isRegistrationRateLimited,
  recordRegistrationAttempt,
  isLoginRateLimited,
  recordLoginFailure,
  clearLoginFailures,
  isAuthEmailRateLimited,
} from "@/lib/queries";
import { confirmParentAccess } from "@/lib/parent-access";
import { completeStudentSignup, redeemStudentHandoff } from "@/lib/student-credential-handoff";
import { performSubmitAttempt, performRevealSolution } from "@/lib/actions-core";
import { checkRegistrationEmail, clientIpFromHeaders, passwordLogin, registerStudent } from "@/lib/auth-flows";
import { sendVerificationEmail, sendPasswordResetEmail } from "@/lib/email";
import { isDisposableEmail, isValidEmailFormat } from "@/lib/email-rules";
import { isYooKassaConfigured } from "@/lib/yookassa";
import { generatePassword, secureToken } from "@/lib/secure-random";

/** Реальный IP клиента (заголовки nginx) — см. lib/auth-flows.ts. */
async function getClientIp(): Promise<string> {
  return clientIpFromHeaders(await headers());
}
import { ASSIGNMENT_KINDS, AssignmentKind, Role } from "@/lib/types";
import { getGroupForTeacher } from "@/lib/groups";
import { cleanImageDataUrl } from "@/lib/image-data";
import { mskEndOfDay } from "@/lib/lesson-time";
import { createLessonReport } from "@/lib/lesson-report";
import { recordSignupSource } from "@/lib/signup-source";
import { ownTaskPhotoIds } from "@/lib/task-photos";
import { displayLogin, isLoginOnlyEmail } from "@/lib/email";
import { createStudentForTeacher, parseGrade, parsePrice } from "@/lib/student-accounts";
import { getPaidOrderForAttempt, isReviewer, markReviewOrderDone } from "@/lib/paid-review";
import { TOPIC_COOKIE } from "@/lib/topic-cookie";
import { getCurriculum, FREE_MAX_ENERGY } from "@/lib/queries";
import { checkPromo, findTeacherByReferral, redeemDaysPromo, PROMO_COOKIE } from "@/lib/promo";
import { isTeacherPaidActive, teacherPlanState, TEACHER_TRIAL_DAYS } from "@/lib/teacher-plan";
import { maxPointsForTask, parseReviewScore, resolveDecision, scoreLabel } from "@/lib/ege-points";
import { createTeacherInvite, cancelTeacherInvite, respondToTeacherInvite, studentLimitError, needsEmailForMoreStudents, EMAIL_FOR_MORE_STUDENTS_TEXT } from "@/lib/teacher-invites";
import { lockStudent, lockTeacherStudents, teacherLinkFor, unlinkStudent } from "@/lib/student-links";

/** Принадлежит ли ученик этому репетитору. Все экшены репетитора, которые
 * принимают studentId из формы, обязаны это проверять сами: серверный экшен
 * можно вызвать напрямую с любым studentId. */
async function isOwnStudent(teacherId: string, studentId: string): Promise<boolean> {
  if (!studentId) return false;
  const student = await getUserById(studentId);
  return !!student && student.role === "STUDENT" && student.teacherId === teacherId;
}

// ---------- AUTH ----------

export async function loginAction(_prevState: unknown, formData: FormData) {
  const res = await passwordLogin(formData.get("email"), formData.get("password"), await getClientIp());
  if ("error" in res) return { error: res.error };
  const token = await createSessionToken(res.user.id, res.user.role, res.authenticatedAt, passwordCredentialVersion(res.user.passwordHash));
  await setSessionCookie(token);
  redirect(`/${res.user.role.toLowerCase()}`);
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/login");
}

/** «Выйти на всех устройствах»: все уже выданные сессии этого пользователя
 * (на телефоне, чужом компьютере, украденная cookie) перестают работать —
 * getSessionUser/api-auth отклоняют токены, выданные раньше sessionsRevokedAt.
 * Текущее устройство тоже разлогиниваем. */
export async function logoutEverywhereAction() {
  const user = await getSessionUser();
  if (user) {
    await db.update(schema.users).set({ sessionsRevokedAt: new Date() }).where(eq(schema.users.id, user.id));
  }
  await clearSessionCookie();
  redirect("/login");
}

// ---------- STUDENT: решение задач ----------

export async function submitAttemptAction(
  problemId: string,
  answer: string,
  source: "lesson" | "assignment" | "review",
  image?: string | null
) {
  const user = await getSessionUser();
  if (!user || user.role !== "STUDENT") {
    return { error: "Нужно войти как ученик" };
  }
  const result = await performSubmitAttempt(user, problemId, answer, source, image);
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
  return performRevealSolution(user, problemId);
}

// ---------- TEACHER: проверка развёрнутых решений ----------

export async function reviewAttemptAction(
  attemptId: string,
  decision: "approved" | "needs_revision",
  feedback: string,
  /** фото решения с пометками репетитора (data URL JPEG) */
  markup?: string | null,
  /** баллы по критериям ФИПИ 0..макс (lib/ege-points.ts); null — без баллов */
  score?: number | null
) {
  const teacher = await getSessionUser();
  if (!teacher || teacher.role !== "TEACHER") return { error: "Доступ запрещён" };
  if (typeof attemptId !== "string" || (decision !== "approved" && decision !== "needs_revision")) return { error: "Некорректный запрос" };
  feedback = typeof feedback === "string" ? feedback.trim().slice(0, 2000) : "";
  if (markup != null && typeof markup !== "string") return { error: "Некорректный запрос" };

  const attemptRows = await db.select().from(schema.attempts).where(eq(schema.attempts.id, attemptId)).limit(1);
  const attempt = attemptRows[0];
  if (!attempt) return { error: "Попытка не найдена" };

  const students = await getStudentsOfTeacher(teacher.id);
  const studentIds = new Set(students.map((s) => s.id));
  // Чужое решение можно проверить, только если это оплаченная платная
  // проверка, а проверяющий — эксперт платформы.
  const paidOrder = !studentIds.has(attempt.studentId) && isReviewer(teacher) ? await getPaidOrderForAttempt(attemptId) : null;
  if (!studentIds.has(attempt.studentId) && !paidOrder) return { error: "Доступ запрещён" };

  const problem = await getProblem(attempt.problemId);
  // Проверять можно только развёрнутое решение, отправленное на проверку (или
  // уже проверенное — оценку можно поменять). Автоматически проверенный ответ
  // (числовой, выбор) раньше тоже можно было «перепроверить» и сменить верно/неверно.
  if (!attempt.reviewStatus || problem?.answerType !== "DETAILED") {
    return { error: "Это решение проверяется автоматически" };
  }
  const skill = problem?.skillId ? await getSkill(problem.skillId) : undefined;

  // Баллы: 0..макс. для номера ЕГЭ; полный балл всегда означает «одобрено».
  const maxPoints = maxPointsForTask(problem?.egeTaskNumber);
  const parsedScore = parseReviewScore(score, maxPoints);
  if (!parsedScore.ok) return { error: `Баллы — целое число от 0 до ${maxPoints}` };
  const reviewScore = parsedScore.score;
  decision = resolveDecision(decision, reviewScore, maxPoints);
  const scoreText = reviewScore !== null ? scoreLabel(reviewScore, maxPoints) : "";

  // Пометки сохраняем только к уже приложенному фото (своё фото репетитор не подставит).
  const marked = cleanImageDataUrl(markup);
  if (markup && !marked) return { error: "Пометки не сохранились: слишком большое фото. Попробуйте ещё раз." };
  const saved = await db.transaction(async (tx) => {
    if (!paidOrder && !(await lockTeacherStudents(tx, teacher.id, [attempt.studentId])).length) return false;
    const [updated] = await tx.update(schema.attempts)
      .set({
        reviewStatus: decision,
        isCorrect: decision === "approved",
        teacherFeedback: feedback || null,
        reviewScore,
      })
      .where(eq(schema.attempts.id, attemptId)).returning({ id: schema.attempts.id });
    if (!updated) return false;

    if (marked) {
      await tx
        .update(schema.attemptImages)
        .set({ annotated: marked })
        .where(eq(schema.attemptImages.attemptId, attemptId));
    }

    if (paidOrder) await markReviewOrderDone(paidOrder.id, tx);
    // Решение из пробника: пересчитать баллы варианта, ссылка — на его разбор.
    const mockId = attempt.source === "mock" ? await onAttemptReviewed(attemptId, tx) : null;

    await pushNotification(tx, {
      userId: attempt.studentId,
      teacherLink: paidOrder ? undefined : await teacherLinkFor(tx, attempt.studentId, teacher.id),
      type: "review_decided",
      title: paidOrder
        ? decision === "approved"
          ? "Эксперт проверил решение: засчитано ✓"
          : "Эксперт проверил решение: есть что исправить"
        : decision === "approved"
          ? `Решение одобрено ✓`
          : `Решение нужно доработать`,
      body: `Навык «${skill?.title ?? ""}»${scoreText ? ` · ${scoreText}` : ""}${feedback ? `: ${feedback}` : ""}${marked ? " · есть пометки на фото" : ""}`,
      link: paidOrder ? "/student/checks" : mockId ? `/student/mock/${mockId}` : `/student`,
    });

    // Если одобрение делает навык полностью пройденным (и это была "урочная"
    // попытка) — так же уведомляем родителей, как и при обычном верном ответе.
    if (decision === "approved" && attempt.source === "lesson" && problem?.skillId) {
      const skillProblems = await getProblemsForSkill(problem.skillId);
      const skillProblemIds = new Set(skillProblems.map((p) => p.id));
      const lessonCorrect = await tx
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
        const parentLinks = await tx
          .select()
          .from(schema.parentLinks)
          .where(eq(schema.parentLinks.studentId, attempt.studentId));
        const student = students.find((s) => s.id === attempt.studentId);
        for (const link of parentLinks) {
          await pushNotification(tx, {
            userId: link.parentId,
            type: "skill_completed",
            title: `${student?.name ?? "Ученик"}: пройдена тема «${skill?.title ?? ""}»`,
            body: `Все задачи темы решены верно.`,
            link: `/parent/child/${attempt.studentId}`,
          });
        }
      }
    }
    return true;
  });
  if (!saved) return { error: "Доступ запрещён" };

  revalidatePath("/teacher");
  revalidatePath("/teacher/reviews");
  revalidatePath("/student");
  return { success: true, decision, score: reviewScore };
}

// ---------- TEACHER: журнал занятий ----------

export async function createLessonLogAction(formData: FormData) {
  const teacher = await getSessionUser();
  const studentId = String(formData.get("studentId") || "");
  if (!teacher || teacher.role !== "TEACHER") {
    redirect(`/teacher/student/${studentId}?tab=lessons&logerror=1`);
  }
  // Проверки (свой ученик, своё занятие, заполненность) и уведомления ученику
  // и родителям — в lib/lesson-report.ts, общие с ботом Telegram.
  const res = await createLessonReport({
    teacherId: teacher.id,
    studentId,
    date: String(formData.get("date") || ""),
    topic: String(formData.get("topic") || ""),
    report: String(formData.get("report") || ""),
    lessonId: String(formData.get("lessonId") || "") || null,
  });
  if (!res.ok) {
    redirect(`/teacher/student/${studentId}?tab=lessons&logerror=${res.reason === "exists" ? "exists" : "1"}`);
  }
  revalidatePath(`/teacher/student/${studentId}`);
  revalidatePath("/teacher");
  redirect(`/teacher/student/${studentId}?tab=lessons`);
}

// ---------- TEACHER: управление учениками ----------

export async function addStudentAction(_prevState: unknown, formData: FormData) {
  const teacher = await getSessionUser();
  if (!teacher || teacher.role !== "TEACHER") return { error: "Доступ запрещён" };

  // До 3 учеников бесплатно, дальше — тариф репетитора (1499 ₽/мес).
  // Владелец платформы (isPlatformOwner) вне этого лимита вообще, как и
  // репетитор с активным teacherPlan='pro'. teacherProUntil===undefined
  // (выдано вручную из /admin бессрочно) тоже считается активным.
  const isTeacherProActive = isTeacherPaidActive(teacher);
  const plan = teacherPlanState(teacher);
  // Анти-абуз: без подтверждения email — только первые ученики
  // (lib/teacher-invites.ts:UNVERIFIED_STUDENT_LIMIT). Платящий репетитор и
  // владелец платформы не затрагиваются.
  if (needsEmailForMoreStudents(teacher, (await getStudentsOfTeacher(teacher.id)).length, isTeacherProActive)) {
    return { error: EMAIL_FOR_MORE_STUDENTS_TEXT };
  }
  // Лимит учеников по тарифу: бесплатно 3, «Репетитор» 15, «Профи» и
  // пробный период — без лимита. Уже добавленные ученики не отключаются.
  if (Number.isFinite(plan.limit)) {
    const currentStudents = await getStudentsOfTeacher(teacher.id);
    const limitError = studentLimitError(teacher, currentStudents.length);
    if (limitError) {
      return { limit: true as const, current: currentStudents.length, error: limitError };
    }
  }

  const name = String(formData.get("name") || "").trim().slice(0, 80);
  const email = String(formData.get("email") || "").trim().toLowerCase().slice(0, 254);
  const consent = formData.get("consent");

  if (!name) return { error: "Укажите имя ученика" };
  if (consent !== "on") {
    return { error: "Нужно подтвердить, что согласие ученика (или его представителя) получено" };
  }

  // Email не обязателен: без него ученику выдаётся логин (lib/student-accounts.ts).
  const res = await createStudentForTeacher(teacher, {
    name,
    email,
    password: String(formData.get("password") || ""),
    grade: parseGrade(formData.get("grade")),
    lessonPriceRub: parsePrice(formData.get("lessonPriceRub")),
  });
  if (!res.ok) {
    // Частый случай: ученик сначала зарегистрировался сам. Привязать чужой
    // аккаунт молча нельзя — отправляем приглашение, ученик подтверждает сам.
    if (res.existing) {
      const inv = await createTeacherInvite(teacher, res.existing);
      if (!inv.ok) return { error: inv.message, inviteError: inv.code };
      revalidatePath("/teacher");
      return { invited: true as const, name: res.existing.name, email: res.existing.email };
    }
    return { error: res.error };
  }
  revalidatePath("/teacher");
  return { success: true, password: res.password, email: displayLogin(res.email), name: res.name, studentId: res.studentId, loginOnly: res.loginOnly };
}

// ---------- Приглашения «репетитор → самостоятельный ученик» ----------

/** Ученик принимает или отклоняет СВОЁ приглашение (проверка — в respondToTeacherInvite). */
export async function respondTeacherInviteAction(inviteId: string, accept: boolean) {
  const user = await getSessionUser();
  if (!user || user.role !== "STUDENT") return { error: "Доступ запрещён" };
  if (typeof inviteId !== "string" || typeof accept !== "boolean") return { error: "Некорректный запрос" };
  const res = await respondToTeacherInvite(user.id, inviteId, accept);
  if (!res.ok) return { error: res.message };
  revalidatePath("/student");
  revalidatePath("/student/profile");
  revalidatePath("/teacher");
  return { success: true as const, accepted: accept };
}

/** Репетитор отзывает своё ожидающее приглашение. */
export async function cancelTeacherInviteAction(formData: FormData) {
  const teacher = await getSessionUser();
  if (!teacher || teacher.role !== "TEACHER") return;
  const inviteId = String(formData.get("inviteId") || "");
  if (inviteId) await cancelTeacherInvite(teacher.id, inviteId);
  revalidatePath("/teacher");
}

async function unlinkStudentFromForm(formData: FormData, legacy: boolean) {
  const teacher = await getSessionUser();
  const studentId = String(formData.get("studentId") || "");
  const result = await unlinkStudent(teacher ?? null, studentId, String(formData.get("linkVersion") || ""), legacy);
  if (!result.ok) return { error: result.error };
  if (result.changed) {
    revalidatePath("/teacher", "layout");
    revalidatePath("/student", "layout");
    revalidatePath("/parent", "layout");
  }
  redirect(legacy ? "/teacher?ok=student_deleted" : "/teacher?ok=student_unlinked");
}

export async function unlinkStudentAction(_state: { error?: string }, formData: FormData) {
  return unlinkStudentFromForm(formData, false);
}

export async function legacyMobileUnlinkStudentAction(formData: FormData) {
  return unlinkStudentFromForm(formData, true);
}

export async function addParentLinkAction(_prevState: unknown, formData: FormData) {
  const teacher = await getSessionUser();
  if (!teacher || teacher.role !== "TEACHER") return { error: "Доступ запрещён" };

  const studentId = String(formData.get("studentId") || "");
  const name = String(formData.get("name") || "").trim().slice(0, 80);
  const email = String(formData.get("email") || "").trim().toLowerCase().slice(0, 254);
  const consent = formData.get("consent");

  if (!name || !email || !studentId) return { error: "Заполните все поля" };
  if (!isValidEmailFormat(email)) return { error: "Проверьте email родителя — похоже, в нём опечатка" };
  if (consent !== "on") {
    return { error: "Нужно подтвердить, что согласие родителя получено" };
  }
  // Родителя можно привязать только к СВОЕМУ ученику. Без этой проверки любой
  // репетитор мог создать "родителя" для чужого ученика и через его кабинет
  // видеть все данные этого ученика.
  const passwordHash = await hashPassword(secureToken());
  const result = await db.transaction(async (tx) => {
    const student = await lockStudent(tx, studentId);
    if (student?.teacherId !== teacher.id) return { error: "Ученик не найден" };

    let [parent] = await tx.select({ id: schema.users.id, role: schema.users.role })
      .from(schema.users).where(eq(schema.users.email, email));
    if (parent) {
      // Существующий кабинет родителя можно привязать, только если этот родитель
      // уже привязан к другому ВАШЕМУ ученику (брат/сестра у того же репетитора).
      // Иначе любой репетитор мог бы «присвоить» чужого родителя и слать ему
      // сообщения от имени сервиса.
      const sibling =
        parent.role === "PARENT"
          ? await tx
              .select({ id: schema.users.id })
              .from(schema.parentLinkRequests)
              .innerJoin(schema.users, eq(schema.users.id, schema.parentLinkRequests.studentId))
              .where(and(eq(schema.parentLinkRequests.parentId, parent.id), eq(schema.users.teacherId, teacher.id)))
              .limit(1)
          : [];
      if (sibling.length === 0) {
        return { error: "Этот email уже используется в сервисе. Укажите другой email родителя." };
      }
    }
    if (!parent) {
      const id = genId("u");
      await tx.insert(schema.users).values({
        id,
        name,
        email,
        passwordHash,
        role: "PARENT",
      });
      parent = { id, role: "PARENT" };
    }

    const alreadyLinked = await tx
      .select()
      .from(schema.parentLinkRequests)
      .where(and(eq(schema.parentLinkRequests.parentId, parent.id), eq(schema.parentLinkRequests.studentId, studentId)))
      .limit(1);
    if (alreadyLinked.length === 0) {
      await tx.insert(schema.parentLinkRequests).values({ parentId: parent.id, studentId }).onConflictDoNothing();
    }
    return { success: true };
  });
  if (result.success) revalidatePath(`/teacher/student/${studentId}`);
  return result;
}

export async function createHomeworkAction(formData: FormData) {
  const teacher = await getSessionUser();
  // Задание одному ученику или всей группе (копия каждому, общий batchId).
  const groupId = String(formData.get("groupId") || "");
  const group = groupId && teacher ? await getGroupForTeacher(groupId, teacher.id) : undefined;
  const studentId = group ? "" : String(formData.get("studentId") || "");
  // Ошибку отдаём кодом (?error=<code>), а название/срок/тип — обратно в URL,
  // чтобы страница показала понятное сообщение и не сбрасывала введённое.
  const errBack = (code = "1") => {
    const q = new URLSearchParams(group ? { groupId } : { studentId });
    q.set("error", code);
    const keep = (k: string, max: number) => {
      const v = String(formData.get(k) || "").trim().slice(0, max);
      if (v) q.set(k, v);
    };
    keep("title", 120);
    keep("dueDate", 10);
    keep("kind", 10);
    keep("timeLimitMinutes", 4);
    if (formData.get("allowHints") !== "on") q.set("noHints", "1");
    return `/teacher/homework/new?${q.toString()}`;
  };
  if (!teacher || teacher.role !== "TEACHER") {
    redirect(errBack("access"));
  }
  // Только своему ученику: иначе любой репетитор мог слать домашки и записи
  // журнала (с уведомлениями ученику и родителям) чужим ученикам.
  if (groupId ? !group || group.members.length === 0 : !(await isOwnStudent(teacher.id, studentId))) {
    redirect(errBack("access"));
  }
  const candidates = group ? group.members.map((m) => m.id) : [studentId];
  const batchId = group ? genId("hb") : null;

  const title = String(formData.get("title") || "").trim().slice(0, 120);
  const dueDate = String(formData.get("dueDate") || "");
  // Только существующие задачи банка (с навыком): иначе можно было бы
  // подсунуть id чужой авторской задачи и открыть её своему ученику.
  const requestedIds = Array.from(new Set(formData.getAll("problemIds").map(String))).slice(0, 60);
  const bankProblemIds = requestedIds.length
    ? (
        await db
          .select({ id: schema.problems.id })
          .from(schema.problems)
          .where(and(inArray(schema.problems.id, requestedIds), isNotNull(schema.problems.skillId)))
      )
        .map((r) => r.id)
        .sort((a, b) => requestedIds.indexOf(a) - requestedIds.indexOf(b))
    : [];
  // Только известные типы: значение приходит из формы, а серверный экшен можно
  // вызвать напрямую с любой строкой (любое «не homework» раньше считалось
  // контрольной и ломало подписи/логику подсказок).
  const kindRaw = String(formData.get("kind") || "homework");
  if (!ASSIGNMENT_KINDS.includes(kindRaw as AssignmentKind)) redirect(errBack());
  const kind = kindRaw as AssignmentKind;
  const allowHints = formData.get("allowHints") === "on";
  const timeLimitRaw = String(formData.get("timeLimitMinutes") || "").trim();
  const tl = parseInt(timeLimitRaw, 10);
  const timeLimitMinutes = timeLimitRaw && Number.isFinite(tl) ? Math.min(600, Math.max(1, tl)) : undefined;

  // Свои задачи, написанные учителем прямо в форме (не из банка навыков) —
  // создаём как обычные Problem без skillId, только для этого задания.
  type DraftProblem = {
    text: string;
    answerType: "NUMBER" | "DETAILED";
    correctAnswer: string;
    hint: string;
    explanation: string;
    photoId?: string;
  };
  const customRaw = String(formData.get("customProblems") || "[]");
  let drafts: DraftProblem[] = [];
  try {
    const parsed: unknown = customRaw.length <= 200_000 ? JSON.parse(customRaw) : [];
    drafts = (Array.isArray(parsed) ? parsed : [])
      .filter((d): d is DraftProblem => !!d && typeof d === "object" && typeof d.text === "string" && typeof d.correctAnswer === "string")
      .filter((d) => d.text.trim() && d.correctAnswer.trim())
      .slice(0, 30)
      .map((d) => ({
        text: d.text.slice(0, 3000),
        answerType: d.answerType === "DETAILED" ? "DETAILED" : "NUMBER",
        correctAnswer: d.correctAnswer.slice(0, 2000),
        hint: typeof d.hint === "string" ? d.hint.slice(0, 1000) : "",
        explanation: typeof d.explanation === "string" ? d.explanation.slice(0, 3000) : "",
        photoId: typeof d.photoId === "string" ? d.photoId.slice(0, 40) : undefined,
      }));
  } catch {
    // некорректный JSON от клиента — просто игнорируем свои задачи, банк не трогаем
  }

  // Фото страниц сборника — только свои (загружены этим репетитором).
  const ownPhotos = await ownTaskPhotoIds(teacher.id, drafts.map((d) => d.photoId ?? ""));
  for (const d of drafts) if (d.photoId && !ownPhotos.has(d.photoId)) d.photoId = undefined;

  // Выдача по шаблону (lib/templates.ts): задачи берём из шаблона этого же
  // репетитора — там могут быть и его авторские задачи без навыка.
  const templateId = String(formData.get("templateId") || "");
  const template = templateId ? await getTemplate(templateId, teacher.id) : null;
  if (templateId && !template) redirect(errBack("access"));
  if (template) drafts = [];

  const problemIds = template ? template.problemIds : [...bankProblemIds, ...drafts.map(() => genId("p"))];
  const customProblemIds = template ? [] : problemIds.slice(bankProblemIds.length);

  // Дата из <input type="date"> — срок до конца этого дня по Москве.
  // new Date("YYYY-MM-DD") — это полночь UTC (03:00 МСК), задание «просрочилось» бы утром.
  const dueAt = /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? mskEndOfDay(dueDate) : null;
  if (problemIds.length === 0) redirect(errBack("noproblems"));
  if (!title) redirect(errBack("notitle"));
  if (!dueAt || isNaN(dueAt.getTime())) redirect(errBack("nodue"));
  if (candidates.length === 0) redirect(errBack("access"));

  const KIND_LABEL: Record<string, string> = {
    homework: "Новое домашнее задание",
    test: "Назначена контрольная работа",
    exam: "Назначен пробный экзамен",
  };

  const targetIds = await db.transaction(async (tx) => {
    const active = await lockTeacherStudents(tx, teacher.id, candidates, group?.id);
    if (!active.length) redirect(errBack("access"));
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
        photoId: d.photoId ?? null,
      });
    }

    for (const sid of active) {
      await tx.insert(schema.homeworks).values({
        id: genId("h"),
        teacherId: teacher.id,
        studentId: sid,
        title,
        kind,
        allowHints,
        timeLimitMinutes: timeLimitMinutes ?? null,
        audience: "assigned",
        problemIds,
        dueDate: dueAt!,
        groupId: group?.id ?? null,
        batchId,
      });

      await pushNotification(tx, {
        userId: sid,
        teacherLink: await teacherLinkFor(tx, sid, teacher.id),
        type: "assignment_created",
        title: KIND_LABEL[kind] ?? "Новое задание",
        body: title,
        link: `/student/homework`,
      });
    }
    return active;
  });

  // «Сохранить как шаблон» — чтобы потом выдать то же задание другим в два клика.
  if (!template && formData.get("saveAsTemplate") === "on") {
    await saveTemplate(teacher.id, { title, kind, allowHints, timeLimitMinutes: timeLimitMinutes ?? null, problemIds });
  }

  for (const sid of targetIds) revalidatePath(`/teacher/student/${sid}`);
  if (group) {
    revalidatePath(`/teacher/groups/${group.id}`);
    redirect(`/teacher/groups/${group.id}?hw=${targetIds.length}`);
  }
  redirect(`/teacher/student/${studentId}?tab=hw&assigned=${problemIds.length}`);
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

/** Проверки адреса при самостоятельной регистрации (ученик и репетитор).
 * Возвращает текст ошибки или null. Анти-абуз: один реальный ящик — один
 * аккаунт (с учётом +меток и синонимов, см. lib/email-rules.ts), одноразовые
 * почты не принимаются. */
/** Промокод из ссылки или формы регистрации: «+N дней» — сразу, скидка —
 * ждёт первой оплаты в куке. Неподходящий код регистрацию не срывает. */
async function applyPromoAtRegistration(userId: string, promoRaw: FormDataEntryValue | null) {
  if (!promoRaw || !String(promoRaw).trim()) return;
  const created = await getUserById(userId);
  if (!created) return;
  const check = await checkPromo(promoRaw, created);
  if (check.ok && check.promo.kind === "days") await redeemDaysPromo(check.promo.code, created);
  else if (check.ok) (await cookies()).set(PROMO_COOKIE, check.promo.code, { maxAge: 30 * 86400, httpOnly: true, sameSite: "lax", path: "/" });
}

export async function registerAction(_prevState: unknown, formData: FormData) {
  const res = await registerStudent(
    {
      name: formData.get("name"),
      email: formData.get("email"),
      password: formData.get("password"),
      consent: formData.get("consent") === "on",
    },
    await getClientIp()
  );
  if ("error" in res) return { error: res.error };
  await applyPromoAtRegistration(res.userId, formData.get("promo"));
  await recordSignupSource(res.userId);
  const token = await createSessionToken(res.userId, "STUDENT");
  await setSessionCookie(token);
  redirect("/onboarding?ym=register");
}

export async function registerTeacherAction(_prevState: unknown, formData: FormData) {
  const name = String(formData.get("name") || "").trim().slice(0, 80);
  const email = String(formData.get("email") || "").trim().toLowerCase().slice(0, 254);
  const password = String(formData.get("password") || "");
  const consent = formData.get("consent");
  const clientIp = await getClientIp();

  // Анти-абуз: без этого лимит "3 ученика бесплатно" тривиально обходится
  // регистрацией 10 разных аккаунтов репетитора (3×10=30 бесплатных мест).
  if (await isRegistrationRateLimited(clientIp, "TEACHER")) {
    return { error: "Слишком много попыток регистрации с этого адреса. Попробуйте позже." };
  }

  if (!name || !email || password.length < 6) {
    await recordRegistrationAttempt(clientIp, "TEACHER");
    return { error: "Заполните имя, email и пароль (минимум 6 символов)" };
  }
  if (consent !== "on") {
    await recordRegistrationAttempt(clientIp, "TEACHER");
    return { error: "Нужно принять условия и дать согласие на обработку персональных данных" };
  }

  const emailError = await checkRegistrationEmail(email);
  if (emailError) {
    await recordRegistrationAttempt(clientIp, "TEACHER");
    return { error: emailError };
  }
  await recordRegistrationAttempt(clientIp, "TEACHER");

  const userId = genId("u");
  // «Пригласи коллегу»: кто прислал ссылку (бонус обоим — после первой оплаты).
  const inviter = await findTeacherByReferral(formData.get("ref"));
  await db.insert(schema.users).values({
    id: userId,
    name,
    email,
    passwordHash: await hashPassword(password),
    role: "TEACHER" as Role,
    referredBy: inviter?.id ?? null,
    consentGivenAt: new Date(),
    // 14 дней «Профи» без карты: завести всех учеников и попробовать всё.
    teacherTrialUntil: new Date(Date.now() + TEACHER_TRIAL_DAYS * 86_400_000),
    // teacherPlan по умолчанию 'free' — до 3 учеников бесплатно (лимит
    // проверяется в addStudentAction), дальше нужен платный тариф.
    // isPlatformOwner НЕ проставляем здесь никогда — этот флаг выдаётся
    // только вручную одному конкретному человеку (владельцу платформы)
    // через прямой SQL, см. README.
  });
  await recordSignupSource(userId);

  const verificationToken = await createAuthToken(userId, "email_verification", 24 * 3600 * 1000);
  await sendVerificationEmail(email, verificationToken).catch((e) =>
    console.error("Не удалось отправить письмо верификации:", e)
  );

  await applyPromoAtRegistration(userId, formData.get("promo"));

  const token = await createSessionToken(userId, "TEACHER");
  await setSessionCookie(token);
  redirect("/teacher?ym=register");
}

// ---------- План Free/Pro (демо-переключение, без реальной оплаты) ----------

/** Демо-переключение Free/Pro без оплаты — ТОЛЬКО для локальной разработки.
 * Серверные экшены можно вызвать напрямую запросом, даже если кнопка скрыта в
 * интерфейсе, поэтому проверка обязана быть здесь, на сервере: в продакшене и
 * везде, где подключена ЮKassa, эти экшены ничего не делают. */
function isDemoPlanSwitchAllowed(): boolean {
  return process.env.NODE_ENV !== "production" && !isYooKassaConfigured();
}

export async function upgradeToProAction() {
  const user = await getSessionUser();
  if (!user || !isStandaloneStudent(user) || !isDemoPlanSwitchAllowed()) {
    redirect("/student");
  }
  await db.update(schema.users).set({ plan: "pro" }).where(eq(schema.users.id, user.id));
  revalidatePath("/student");
  redirect("/student");
}

export async function downgradeToFreeAction() {
  const user = await getSessionUser();
  if (!user || !isStandaloneStudent(user) || !isDemoPlanSwitchAllowed()) {
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

/**
 * Самостоятельная отвязка карты / отмена автопродления тарифа репетитора
 * — обязательное требование ЮKassa при согласовании рекуррентных платежей
 * (без такого интерфейса, без обращения в поддержку, они не подключают
 * опцию автоплатежей вообще). Обнуляет ТОЛЬКО способ оплаты — cron
 * (getTeachersDueForRenewal) перестанет находить этого учителя и не
 * попытается списать снова. teacherPlan/teacherProUntil НЕ трогаем —
 * доступ сохраняется до конца уже оплаченного периода, как и обещано
 * пользователю в подтверждающем диалоге на странице.
 */
export async function cancelTeacherAutoRenewalAction() {
  const user = await getSessionUser();
  if (!user || user.role !== "TEACHER") redirect("/login");

  await db
    .update(schema.users)
    .set({
      yookassaPaymentMethodId: null,
      yookassaCardLast4: null,
      yookassaCardType: null,
    })
    .where(eq(schema.users.id, user.id));
  revalidatePath("/teacher/upgrade");
}

/**
 * Онбординг после регистрации самостоятельного ученика — класс и цель по
 * баллам РЕАЛЬНО меняют порядок/доступность тем (не просто хранятся для
 * отчётности), см. lib/curriculum-recommendations.ts. Можно пропустить
 * (оба поля останутся null) — ничего не ограничиваем, если пользователь
 * не захотел отвечать, старое поведение.
 */
export async function saveOnboardingAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "STUDENT") redirect("/");

  const targetScoreRaw = formData.get("targetScore");
  const targetScore = targetScoreRaw ? Number(targetScoreRaw) : null;
  const dream = String(formData.get("dreamUniversity") || "").trim().slice(0, 120);

  await db
    .update(schema.users)
    .set({
      // Цель ученика репетитора задаёт репетитор — онбординг её не перезаписывает.
      ...(user.teacherId
        ? {}
        : { targetScore: targetScore && targetScore >= 0 && targetScore <= 100 ? targetScore : null }),
      ...(dream ? { dreamUniversity: dream } : {}),
    })
    .where(eq(schema.users.id, user.id));

  // Тема, с которой ученик хочет начать: запоминаем её для «Пути»
  // (раньше все начинали с «Треугольников», даже кто целится в 80+).
  const topicId = String(formData.get("topicId") || "");
  if (topicId && (await getCurriculum()).some((t) => t.topic.id === topicId)) {
    (await cookies()).set(TOPIC_COOKIE, topicId, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
    redirect(`/student?topic=${encodeURIComponent(topicId)}`);
  }
  redirect("/student");
}

// ---------- Подтверждение email и сброс пароля ----------

export async function verifyEmailAction(token: string): Promise<{ success: boolean }> {
  const userId = await consumeAuthToken(token, "email_verification");
  if (!userId) return { success: false };
  await db.update(schema.users).set({ emailVerifiedAt: new Date() }).where(eq(schema.users.id, userId));
  return { success: true };
}

export async function confirmParentAccessAction(_state: { error?: string }, form: FormData) {
  if (form.get("consent") !== "on" ||
      !(await confirmParentAccess(String(form.get("token") ?? ""), String(form.get("password") ?? "")))) {
    return { error: "Проверьте ссылку, согласие и выберите новый пароль от 8 символов." };
  }
  await clearSessionCookie();
  redirect("/login");
}

export async function completeStudentSignupAction(_state: { error?: string }, formData: FormData) {
  const code = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  if (!(await completeStudentSignup(code, password))) {
    return { error: "Ссылка недействительна или пароль не подходит. Задайте новый пароль от 8 символов, не длиннее 72 байт." };
  }
  await clearSessionCookie();
  redirect("/login");
}

/** Для уже залогиненного пользователя, у которого email ещё не
 * подтверждён (например, письмо не дошло с первого раза) — кнопка
 * "отправить письмо ещё раз" в профиле. */
export async function resendVerificationEmailAction() {
  const user = await getSessionUser();
  if (!user || user.emailVerifiedAt) return;
  const [signup] = user.role === "STUDENT" ? await db.select({ id: schema.authTokens.id }).from(schema.authTokens)
    .where(and(eq(schema.authTokens.userId, user.id), eq(schema.authTokens.type, "student_signup_verification"))).limit(1) : [];
  const kind = signup ? "student_signup_verification" : "email_verification";
  if (await isAuthEmailRateLimited(user.id, kind)) return;
  const token = await createAuthToken(user.id, kind, 24 * 3600 * 1000);
  await sendVerificationEmail(user.email, token).catch((e) =>
    console.error("Не удалось повторно отправить письмо верификации:", e)
  );
}

/**
 * Намеренно не сообщает, существует ли email в системе — иначе форму
 * можно было бы использовать для проверки, кто зарегистрирован на
 * платформе (утечка информации о пользователях). Всегда возвращает
 * одинаковый успех, реальная отправка письма — только если аккаунт
 * действительно найден.
 */
export async function requestPasswordResetAction(_prevState: unknown, formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase().slice(0, 254);
  if (!email) return { error: "Введите email" };

  const user = await getUserByEmail(email);
  // Ответ одинаковый в любом случае (не выдаём, есть ли аккаунт), но писем —
  // не больше трёх в час на аккаунт.
  if (user && !(await isAuthEmailRateLimited(user.id, "password_reset"))) {
    const token = await createAuthToken(user.id, "password_reset", 3600 * 1000);
    await sendPasswordResetEmail(email, token).catch((e) =>
      console.error("Не удалось отправить письмо сброса пароля:", e)
    );
  }
  return { success: true };
}

export async function resetPasswordAction(_prevState: unknown, formData: FormData) {
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  if (password.length < 6) {
    return { error: "Пароль должен быть не короче 6 символов" };
  }

  const resetTokens = schema.authTokens;
  const [candidate] = await db.select({ userId: resetTokens.userId }).from(resetTokens)
    .where(and(eq(resetTokens.token, token), eq(resetTokens.type, "password_reset")));
  if (!candidate) return { error: "Ссылка недействительна или уже была использована. Запросите сброс пароля ещё раз." };
  const passwordHash = await hashPassword(password);
  const changed = await db.transaction(async (tx) => {
    const [account] = await tx.select().from(schema.users)
      .where(eq(schema.users.id, candidate.userId)).for("update");
    if (!account) return null;
    if (account.role === "STUDENT" && !account.independentCredentials &&
      (Buffer.byteLength(password, "utf8") > 72 || await verifyPassword(password, account.passwordHash))) {
      return null;
    }
    const [claimed] = await tx.update(resetTokens).set({ usedAt: sql`clock_timestamp()` }).where(and(
      eq(resetTokens.token, token), eq(resetTokens.type, "password_reset"), eq(resetTokens.userId, account.id),
      isNull(resetTokens.usedAt), gt(resetTokens.expiresAt, sql`clock_timestamp()`),
    )).returning({ id: resetTokens.id });
    if (!claimed) return null;
    await tx.update(schema.users).set({
      passwordHash, passwordChangedAt: sql`clock_timestamp()`, credentialHandoffPending: false,
    }).where(eq(schema.users.id, account.id));
    return account.email;
  });
  if (!changed) return { error: "Не удалось сменить пароль. Запросите новую ссылку и выберите новый пароль." };
  await clearLoginFailures(changed);
  redirect("/login");
}

export async function takeStudentCredentialsAction(_state: { error?: string }, formData: FormData) {
  const user = await getSessionUser();
  if (!user || user.role !== "STUDENT" || user.independentCredentials) return { error: "Передача доступа недоступна." };
  const code = String(formData.get("handoffCode") || "").trim();
  const password = String(formData.get("password") || "");
  if (!(await redeemStudentHandoff(user.id, code, password))) {
    return { error: "Проверьте одноразовый код и придумайте новый пароль от 8 символов, не длиннее 72 байт." };
  }
  await clearLoginFailures(user.email);
  await clearSessionCookie();
  redirect("/login");
}
