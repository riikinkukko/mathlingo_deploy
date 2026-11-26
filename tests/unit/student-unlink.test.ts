import { issueParentAccess, confirmParentAccess } from "../../lib/parent-access";
import { createAuthToken, consumeAuthToken } from "../../lib/queries";
import { parentChild } from "../../lib/mobile/parent-data";
import { sendStudentEveningReminders } from "../../lib/student-reminders";
import { savePushToken } from "../../lib/push";
import { verifyEmailAction } from "../../app/actions";
import { performSubmitAttempt } from "../../lib/actions-core";
import { performAskTeacher } from "../../lib/questions-core";
import { handleCallbackQuery, sendLessonStatusPrompts } from "../../lib/teacher-telegram";
import { completeStudentSignup, getStudentSignupLink, issueStudentHandoff, redeemStudentHandoff } from "../../lib/student-credential-handoff";
import { getBearerUser } from "../../lib/api-auth";
import { POST as mobileLogin } from "../../app/api/m/auth/login/route";
import { deliverWhenCommitted, generateTelegramLinkCode, linkTelegramAccountByCode, withNotificationDelivery } from "../../lib/queries";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { and, eq, sql } from "drizzle-orm";
import { Client } from "pg";
import { workAsyncStorage } from "next/dist/server/app-render/work-async-storage.external";
import { POST as teacherAction } from "../../app/api/m/teacher/action/route";
import { GET as teacherData } from "../../app/api/m/teacher/data/route";
import { GET as homeworkList } from "../../app/api/m/homework/route";
import { GET as homeworkDetail } from "../../app/api/m/homework/[id]/route";
import { GET as parentData } from "../../app/api/m/parent/route";
import { GET as attemptImage } from "../../app/api/attempt-image/[id]/route";
import { GET as questionSketch } from "../../app/api/question-sketch/[id]/route";
import { createSessionToken, hashPassword, isSessionRevoked, passwordCredentialVersion, runAsUser, verifySessionToken } from "../../lib/auth";
import { passwordLogin, registerStudent } from "../../lib/auth-flows";
import { db } from "../../lib/db/client";
import * as s from "../../lib/db/schema";
import { getUserById, getStudentBalance, getQuestionsForTeacher, computeOverallStats } from "../../lib/queries";
import { applyLessonStatus } from "../../lib/lesson-status";
import { unlinkStudent, UNLINK_CLIENT_UPDATE, UNLINK_CREDENTIALS, UNLINK_DENIED } from "../../lib/student-links";
import { cancelTeacherInvite, createTeacherInvite, respondToTeacherInvite } from "../../lib/teacher-invites";
import { readTaskPhoto } from "../../lib/task-photos";
import { resetStudentPasswordAction } from "../../app/actions-import";
import { cleanup, makeHomework, makeUser, problems } from "../helpers";
import type { User } from "../../lib/types";

after(cleanup);

const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const version = (u: User) => {
  assert.ok(u.teacherLinkVersion);
  return u.teacherLinkVersion;
};
const readUser = async (u: User) => {
  const current = await getUserById(u.id);
  assert.ok(current);
  return current;
};
const withRequest = <T>(fn: () => Promise<T>) =>
  workAsyncStorage.run({ route: "/api/m/teacher/action", incrementalCache: {} } as never, fn);
const request = async (path: string, user?: User, body?: unknown) => new Request(`http://x${path}`, {
  method: body ? "POST" : "GET",
  headers: user ? { authorization: `Bearer ${await createSessionToken(user.id, user.role)}` } : {},
  body: body ? JSON.stringify(body) : undefined,
});
const action = async (user: User | undefined, name: string, fields: Record<string, string>) => {
  const req = await request("/api/m/teacher/action", user, { name, fields });
  return withRequest(() => teacherAction(req));
};
async function relink(teacher: User, student: User) {
  const invite = await createTeacherInvite(teacher, student);
  assert.ok(invite.ok);
  assert.ok((await respondToTeacherInvite(student.id, invite.inviteId, true)).ok);
  return readUser(student);
}

test("mobile and web data survive a versioned unlink, and only the current pair is cleaned", async () => {
  const teacher = await makeUser({ role: "TEACHER" });
  const other = await makeUser({ role: "TEACHER" });
  const parent = await makeUser({ role: "PARENT" });
  const anotherParent = await makeUser({ role: "PARENT" });
  const unrelatedParent = await makeUser({ role: "PARENT" });
  const password = "fixture-private-password";
  const student = await makeUser({
    independentCredentials: true, passwordHash: await hashPassword(password), plan: "pro",
    proUntil: new Date(Date.now() + 604800000), deletionRequestedAt: new Date(), lessonPriceRub: 1200,
    groupLessonPriceRub: 800, paymentRemindersEnabled: true,
  });
  const linked = await relink(teacher, student);
  const linkVersion = version(linked);
  const [bank] = await problems(1);
  assert.ok(bank);
  const [studentBefore] = await db.select().from(s.users).where(eq(s.users.id, student.id));
  const future = new Date(Date.now() + 86400000);
  const past = new Date(Date.now() - 3600000);
  const firstGroup = `${student.id}_first`;
  const secondGroup = `${student.id}_second`;
  const otherGroup = `${student.id}_other`;
  await db.insert(s.studentGroups).values([
    { id: firstGroup, teacherId: teacher.id, name: "First group" },
    { id: secondGroup, teacherId: teacher.id, name: "Second group" },
    { id: otherGroup, teacherId: other.id, name: "Legacy membership" },
  ]);
  await db.insert(s.studentGroupMembers).values([firstGroup, secondGroup, otherGroup].map((groupId) => ({ groupId, studentId: student.id })));
  await db.insert(s.parentLinkRequests).values([parent, anotherParent].map((p) => ({ verifiedAt: new Date(), parentId: p.id, studentId: student.id })));
  const paymentId = `${student.id}_payment`;
  await db.insert(s.studentPayments).values({ id: paymentId, teacherId: teacher.id, studentId: student.id, amountRub: 2400, paidAt: "2026-11-10" });
  await db.insert(s.scheduledLessons).values([
    { id: `${student.id}_done`, teacherId: teacher.id, studentId: student.id, startsAt: past, status: "done", priceRub: 900 },
    { id: `${student.id}_future`, teacherId: teacher.id, studentId: student.id, startsAt: future, groupId: firstGroup },
    { id: `${student.id}_other`, teacherId: other.id, studentId: student.id, startsAt: future },
  ]);
  await db.insert(s.lessonLogs).values({ id: `${student.id}_log`, teacherId: teacher.id, studentId: student.id, date: "2026-11-10", report: "Previous lesson report", topic: "Angles" });
  await db.insert(s.teacherInvites).values([
    { id: `${student.id}_stale`, teacherId: teacher.id, studentId: student.id },
    { id: `${student.id}_other`, teacherId: other.id, studentId: student.id },
  ]);
  const photoId = `${student.id}_photo`;
  const problemId = `${student.id}_problem`;
  const attemptId = `${student.id}_attempt`;
  const questionId = `${student.id}_question`;
  await db.insert(s.taskPhotos).values({ id: photoId, teacherId: teacher.id, data: image });
  await db.insert(s.problems).values({ id: problemId, text: "Фото", correctAnswer: "1", answerType: "DETAILED", egeTaskNumber: 17, photoId, hints: [], explanation: "", difficulty: 2 });
  try {
    const completed = await makeHomework({ studentId: student.id, teacherId: teacher.id, problemIds: [bank.id] });
    const started = await makeHomework({ studentId: student.id, teacherId: teacher.id, problemIds: [problemId], kind: "test", timeLimitMinutes: 30 });
    const startedAt = new Date(Date.now() - 30000);
    await db.insert(s.assignmentSessions).values({ id: `${student.id}_session`, studentId: student.id, homeworkId: started, startedAt });
    await db.insert(s.attempts).values([
      { id: `${student.id}_automatic`, studentId: student.id, problemId: bank.id, source: "assignment", answer: "1", isCorrect: true },
      { id: attemptId, studentId: student.id, problemId, source: "mock", answer: "", isCorrect: true, reviewStatus: "approved", teacherFeedback: "Correct", reviewScore: 2 },
    ]);
    await db.insert(s.attemptImages).values({ attemptId, data: image, annotated: image });
    await db.insert(s.srsStates).values({ studentId: student.id, problemId: bank.id, box: 3, reviewCount: 5 });
    await db.insert(s.mockAttempts).values({ id: `${student.id}_mock`, studentId: student.id, variant: 1, mode: "full",
      items: [{ n: 17, problemId }], part2Attempts: { [problemId]: attemptId }, finishedAt: past, primaryScore: 2, testScore: 10 });
    await db.insert(s.studentQuestions).values({ id: questionId, studentId: student.id, teacherId: teacher.id, problemId, sketch: image });

    const rows = () => Promise.all([
      db.select().from(s.homeworks).where(eq(s.homeworks.studentId, student.id)).orderBy(s.homeworks.id),
      db.select().from(s.assignmentSessions).where(eq(s.assignmentSessions.studentId, student.id)),
      db.select().from(s.attempts).where(eq(s.attempts.studentId, student.id)).orderBy(s.attempts.id),
      db.select().from(s.attemptImages).where(eq(s.attemptImages.attemptId, attemptId)),
      db.select().from(s.mockAttempts).where(eq(s.mockAttempts.studentId, student.id)),
      db.select().from(s.srsStates).where(eq(s.srsStates.studentId, student.id)),
      db.select().from(s.lessonLogs).where(eq(s.lessonLogs.studentId, student.id)),
      db.select().from(s.studentQuestions).where(eq(s.studentQuestions.studentId, student.id)),
      db.select().from(s.parentLinks).where(eq(s.parentLinks.studentId, student.id)).orderBy(s.parentLinks.parentId),
    ]);
    const beforeRows = await rows();
    const statsBefore = await computeOverallStats(student.id);
    const oldSession = await request("/api/m/homework", student);
    const fields = { studentId: student.id, linkVersion };
    assert.equal((await action(undefined, "unlinkStudent", fields)).status, 401);
    for (const wrong of [student, parent]) assert.equal((await action(wrong, "unlinkStudent", fields)).status, 403);
    assert.equal((await action(other, "unlinkStudent", fields)).status, 400);
    assert.equal((await action(teacher, "unlinkStudent", { ...fields, studentId: "missing" })).status, 400);
    const response = await action(teacher, "unlinkStudent", fields);
    assert.deepEqual(await response.json(), { ok: true, redirect: "/teacher?ok=student_unlinked" });
    assert.deepEqual(await rows(), beforeRows);
    assert.deepEqual(await computeOverallStats(student.id), statsBefore);
    const [afterUser] = await db.select().from(s.users).where(eq(s.users.id, student.id));
    assert.deepEqual(afterUser, { ...studentBefore, teacherId: null, teacherLinkVersion: afterUser.teacherLinkVersion,
      lessonPriceRub: null, groupLessonPriceRub: null, paymentRemindersEnabled: false });
    assert.notEqual(afterUser.teacherLinkVersion, linkVersion);
    assert.ok("user" in await passwordLogin(student.email, password, ""));
    assert.equal((await homeworkList(oldSession)).status, 200);
    const list = await (await homeworkList(await request("/api/m/homework", student))).json();
    assert.deepEqual(new Set(list.items.map((item: { id: string }) => item.id)), new Set([completed, started]));
    const detail = await homeworkDetail(await request(`/api/m/homework/${started}`, student), { params: Promise.resolve({ id: started }) });
    assert.equal(detail.status, 200);
    assert.equal((await detail.json()).deadlineAt, new Date(startedAt.getTime() + 1800000).toISOString());
    assert.ok(await readTaskPhoto(await readUser(student), photoId));
    assert.ok(await readTaskPhoto(parent, photoId));
    assert.equal(await readTaskPhoto(unrelatedParent, photoId), null);
    assert.equal((await parentData(await request(`/api/m/parent?view=child&id=${student.id}`, parent))).status, 200);
    assert.equal((await parentData(await request(`/api/m/parent?view=child&id=${student.id}`, unrelatedParent))).status, 404);
    assert.equal((await teacherData(await request(`/api/m/teacher/data?view=student&id=${student.id}`, teacher))).status, 404);
    assert.equal((await action(teacher, "reviewAttempt", { attemptId, decision: "needs_revision" })).status, 400);
    assert.equal((await action(teacher, "addParent", { studentId: student.id, name: "Parent", email: "new@test.local", consent: "on" })).status, 400);
    const directPhoto = (user: User) => runAsUser(user, () => attemptImage(new Request("http://x/api/attempt-image?v=markup"), { params: Promise.resolve({ id: attemptId }) }));
    assert.equal((await directPhoto(teacher)).status, 404);
    assert.equal((await directPhoto(student)).status, 200);
    assert.equal((await runAsUser(teacher, () => questionSketch(new Request("http://x"), { params: Promise.resolve({ id: questionId }) }))).status, 404);
    assert.deepEqual(await getQuestionsForTeacher(teacher.id), []);
    assert.deepEqual((await db.select().from(s.studentGroupMembers).where(eq(s.studentGroupMembers.studentId, student.id))).map((r) => r.groupId), [otherGroup]);
    const lessonRows = await db.select().from(s.scheduledLessons).where(eq(s.scheduledLessons.studentId, student.id));
    assert.deepEqual(Object.fromEntries(lessonRows.map((r) => [r.id.split("_").at(-1), r.status])), { done: "done", future: "cancelled", other: "planned" });
    assert.equal(lessonRows.find((r) => r.status === "done")?.priceRub, 900);
    const [payment] = await db.select().from(s.studentPayments).where(eq(s.studentPayments.id, paymentId));
    assert.ok(payment.archivedAt);
    assert.equal(payment.amountRub, 2400);
    const [otherInvite] = await db.select().from(s.teacherInvites).where(and(eq(s.teacherInvites.teacherId, other.id), eq(s.teacherInvites.studentId, student.id)));
    assert.equal(otherInvite.status, "pending");
    assert.ok((await respondToTeacherInvite(student.id, otherInvite.id, true)).ok);
    assert.deepEqual(await unlinkStudent(teacher, student.id, linkVersion), { ok: true, changed: false });
    assert.equal((await readUser(student)).teacherId, other.id);
    assert.equal((await directPhoto(other)).status, 200);
    assert.equal((await getStudentBalance(other.id, student.id))?.paidRub, 0);
    assert.deepEqual(await db.select().from(s.studentGroupMembers).where(eq(s.studentGroupMembers.studentId, student.id)), []);
  } finally {
    await db.delete(s.problems).where(eq(s.problems.id, problemId));
  }
});

test("legacy API retains its success shape and asks for an update after the same pair reconnects", async () => {
  const teacher = await makeUser({ role: "TEACHER" });
  const student = await makeUser({ teacherId: teacher.id, independentCredentials: true });
  const fields = { studentId: student.id };
  assert.deepEqual(await (await action(teacher, "deleteStudent", fields)).json(), { ok: true, redirect: "/teacher?ok=student_deleted" });
  const relinked = await relink(teacher, student);
  const oldResponse = await action(teacher, "deleteStudent", fields);
  assert.equal(oldResponse.status, 400);
  assert.match(JSON.stringify(await oldResponse.json()), new RegExp(UNLINK_CLIENT_UPDATE.slice(0, -1)));
  assert.deepEqual(await unlinkStudent(teacher, student.id, version(student)), { ok: true, changed: false });
  assert.equal((await readUser(student)).teacherId, teacher.id);
  assert.notEqual(version(student), version(relinked));
});

test("teacher-issued credentials require the student's new password and login before unlink", async () => {
  const teacher = await makeUser({ role: "TEACHER" });
  const password = "new-fixture-password";
  for (const email of [`${teacher.id}@u.planimetrika.online`, `${teacher.id}-student@test.local`]) {
    const student = await makeUser({ teacherId: teacher.id, email, passwordHash: await hashPassword("issued-password") });
    const fields = new FormData();
    fields.set("studentId", student.id);
    assert.deepEqual(await unlinkStudent(teacher, student.id, version(student)), { ok: false, error: UNLINK_CREDENTIALS });
    const shortLogin = email.endsWith("@u.planimetrika.online");
    assert.equal(await issueStudentHandoff({ id: teacher.id }, student.id), null);
    assert.equal(await redeemStudentHandoff(student.id, "a".repeat(43), password), false);
    const code = await issueStudentHandoff({ id: "owner", isAdmin: true, isPlatformOwner: true }, student.id);
    assert.ok(code);
    assert.equal(await redeemStudentHandoff(student.id, code, password), true);
    assert.equal(await redeemStudentHandoff(student.id, code, "another-fixture-password"), false);
    assert.deepEqual(await unlinkStudent(teacher, student.id, version(student)), { ok: false, error: UNLINK_CREDENTIALS });
    const login = shortLogin ? email.split("@")[0] : email;
    assert.ok("error" in await passwordLogin(login, "issued-password", ""));
    assert.ok("user" in await passwordLogin(login, password, ""));
    assert.ok((await runAsUser(teacher, () => resetStudentPasswordAction(null, fields)))?.error);
    assert.deepEqual(await unlinkStudent(teacher, student.id, version(student)), { ok: true, changed: true });
    assert.ok("user" in await passwordLogin(login, password, ""));
    assert.ok((await runAsUser(teacher, () => resetStudentPasswordAction(null, fields)))?.error);
  }
});

async function waitForBlocked(connection: Client, pid: number) {
  const until = Date.now() + 4000;
  while (Date.now() < until) {
    const result = await connection.query("select 1 from pg_stat_activity where $1 = any(pg_blocking_pids(pid))", [pid]);
    if (result.rowCount) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail("No waiting PostgreSQL connection");
}

test("independent PostgreSQL connections serialize detach, retries, invitation writes and group assignments", async () => {
  const teacher = await makeUser({ role: "TEACHER" });
  const student = await makeUser({ teacherId: teacher.id, independentCredentials: true });
  const groupId = `${student.id}_group`;
  await db.insert(s.studentGroups).values({ id: groupId, teacherId: teacher.id, name: "Group" });
  await db.insert(s.studentGroupMembers).values({ groupId, studentId: student.id });
  const inviteId = `${student.id}_stale`;
  await db.insert(s.teacherInvites).values({ id: inviteId, studentId: student.id, teacherId: teacher.id });
  const connection = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await connection.connect();
  try {
    await connection.query("begin");
    await connection.query("select id from users where id = $1 for update", [student.id]);
    const { rows: [{ pid }] } = await connection.query("select pg_backend_pid() as pid");
    const first = unlinkStudent(teacher, student.id, version(student));
    await waitForBlocked(connection, pid);
    const retry = unlinkStudent(teacher, student.id, version(student));
    const accept = respondToTeacherInvite(student.id, inviteId, true);
    const revoke = cancelTeacherInvite(teacher.id, inviteId);
    const [bank] = await problems(1);
    assert.ok(bank);
    const assign = action(teacher, "createHomework", {
      groupId, title: "Concurrent group assignment", dueDate: "2026-12-01", problemIds: bank.id,
    });
    await connection.query("commit");
    const [applied, duplicate, accepted, revoked, targets] = await Promise.all([first, retry, accept, revoke, assign]);
    assert.deepEqual(applied, { ok: true, changed: true });
    assert.deepEqual(duplicate, { ok: true, changed: false });
    assert.equal(accepted.ok, false);
    assert.equal(revoked, false);
    assert.equal(targets.status, 400);
    assert.deepEqual(await db.select().from(s.homeworks).where(eq(s.homeworks.studentId, student.id)), []);
    assert.equal((await db.select().from(s.studentUnlinks).where(eq(s.studentUnlinks.studentId, student.id))).length, 1);
  } finally {
    await connection.end();
  }
});

test("a failed audit insert rolls back the relationship, membership and schedule; old deletes fail closed", async () => {
  const teacher = await makeUser({ role: "TEACHER" });
  const student = await makeUser({ teacherId: teacher.id, independentCredentials: true });
  const groupId = `${student.id}_group`;
  await db.insert(s.studentGroups).values({ id: groupId, teacherId: teacher.id, name: "Group" });
  await db.insert(s.studentGroupMembers).values({ groupId, studentId: student.id });
  const lessonId = `${student.id}_lesson`;
  await db.insert(s.scheduledLessons).values({ id: lessonId, teacherId: teacher.id, studentId: student.id, startsAt: new Date(Date.now() + 60000) });
  await db.execute(sql`create function test_reject_unlink() returns trigger language plpgsql as $$
    begin raise exception 'synthetic audit failure'; end; $$`);
  await db.execute(sql`create trigger test_reject_unlink before insert on student_unlinks
    for each row execute function test_reject_unlink()`);
  try {
    await assert.rejects(unlinkStudent(teacher, student.id, version(student)));
    assert.equal((await readUser(student)).teacherId, teacher.id);
    assert.equal((await db.select().from(s.studentGroupMembers).where(eq(s.studentGroupMembers.groupId, groupId))).length, 1);
    const [lesson] = await db.select().from(s.scheduledLessons).where(eq(s.scheduledLessons.id, lessonId));
    assert.equal(lesson.status, "planned");
    assert.equal(lesson.archivedAt, null);
    assert.deepEqual(await db.select().from(s.studentUnlinks).where(eq(s.studentUnlinks.studentId, student.id)), []);
  } finally {
    await db.execute(sql`drop trigger test_reject_unlink on student_unlinks`);
    await db.execute(sql`drop function test_reject_unlink()`);
  }
  await assert.rejects(db.delete(s.users).where(eq(s.users.id, student.id)), (error: unknown) => (error as { cause?: { code?: string } }).cause?.code === "42501");
  assert.deepEqual(await unlinkStudent(teacher, student.id, "wrong-version"), { ok: false, error: UNLINK_DENIED });
  assert.deepEqual(await unlinkStudent(teacher, student.id, version(student)), { ok: true, changed: true });
  assert.equal((await applyLessonStatus(teacher.id, lessonId, "planned")).ok, false);
});

test("a password reset racing the handoff and detach cannot write a teacher-issued password", async () => {
  const teacher = await makeUser({ role: "TEACHER" });
  const hash = await hashPassword("private-after-handoff");
  const student = await makeUser({
    teacherId: teacher.id, email: `${teacher.id}@u.planimetrika.online`, passwordHash: hash,
  });
  const form = new FormData();
  form.set("studentId", student.id);
  const connection = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await connection.connect();
  try {
    await connection.query("begin");
    await connection.query("update users set independent_credentials = true where id = $1", [student.id]);
    const { rows: [{ pid }] } = await connection.query("select pg_backend_pid() as pid");
    const reset = runAsUser(teacher, () => resetStudentPasswordAction(null, form));
    await waitForBlocked(connection, pid);
    const detach = unlinkStudent(teacher, student.id, version(student));
    await connection.query("commit");
    assert.ok((await reset)?.error);
    assert.deepEqual(await detach, { ok: true, changed: true });
    assert.equal((await readUser(student)).passwordHash, hash);
  } finally {
    await connection.end();
  }
});

test("password login concurrently with handoff cannot renew a web or mobile session", async () => {
  const teacher = await makeUser({ role: "TEACHER" });
  const student = await makeUser({ teacherId: teacher.id, passwordHash: await hashPassword("issued-fixture") });
  const code = await issueStudentHandoff({ id: "owner", isAdmin: true, isPlatformOwner: true }, student.id);
  assert.ok(code);
  const blocker = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await blocker.connect();
  try {
    await blocker.query("begin");
    await blocker.query("select id from users where id = $1 for update", [student.id]);
    const { rows: [{ pid }] } = await blocker.query("select pg_backend_pid() as pid");
    const handoff = redeemStudentHandoff(student.id, code, "independent-fixture");
    await waitForBlocked(blocker, pid);
    const browserLogin = await passwordLogin(student.email, "issued-fixture", "");
    assert.ok("user" in browserLogin);
    const webToken = await createSessionToken(student.id, "STUDENT", browserLogin.authenticatedAt, passwordCredentialVersion(browserLogin.user.passwordHash));
    const appLogin = await mobileLogin(new Request("http://local/api/m/auth/login", {
      method: "POST", body: JSON.stringify({ email: student.email, password: "issued-fixture" }),
    }));
    assert.equal(appLogin.status, 200);
    const { token: mobileToken } = await appLogin.json();
    await blocker.query("commit");
    assert.ok(await handoff);
    const session = await verifySessionToken(webToken);
    assert.ok(session);
    assert.equal(isSessionRevoked(await readUser(student), session.issuedAt, session.authenticatedAt, session.credentialVersion), true);
    assert.equal(await getBearerUser(new Request("http://local", { headers: { authorization: `Bearer ${mobileToken}` } })), null);
    assert.ok("user" in await passwordLogin(student.email, "independent-fixture", ""));
  } finally {
    await blocker.end();
  }
});

test("a committed unlink cancels pending push and Telegram; in-flight handoff holds the lock", async () => {
  const teacher = await makeUser({ role: "TEACHER", telegramChatId: "synthetic-chat" });
  const student = await makeUser({ teacherId: teacher.id, independentCredentials: true });
  const id = `notify_${student.id}`;
  await db.insert(s.notifications).values({ id, userId: teacher.id, type: "homework_completed", title: "fixture", body: "fixture", link: "/" });
  const params = { userId: teacher.id, title: "fixture", body: "fixture", link: "/",
    teacherLink: { studentId: student.id, teacherId: teacher.id, version: version(student) } };
  let count = 0;
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const paused = new Promise<void>((resolve) => { release = resolve; });
  const delivery = deliverWhenCommitted(id, params, {
    push: async () => { count++; entered(); await paused; return true; },
    telegram: async () => { count++; await paused; return true; },
  });
  await started;
  let ended = false;
  const detach = unlinkStudent(teacher, student.id, version(student)).then((result) => { ended = true; return result; });
  try {
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(ended, false);
  } finally {
    release();
  }
  assert.ok(await delivery);
  assert.deepEqual(await detach, { ok: true, changed: true });
  assert.equal(count, 2);
  assert.equal(await deliverWhenCommitted(id, params, {
    push: async () => { count++; return true; },
    telegram: async () => { count++; return true; },
  }), false);
  assert.equal(count, 2);
});

test("direct Telegram lesson prompt and unlink are serialized", async () => {
  const teacher = await makeUser({ role: "TEACHER", telegramChatId: "synthetic-lesson-chat", tgNotifyLessons: true });
  const student = await makeUser({ teacherId: teacher.id, independentCredentials: true });
  const now = new Date("2027-01-05T12:00:00+03:00");
  const id = `prompt_${student.id}`;
  await db.insert(s.scheduledLessons).values({
    id, teacherId: teacher.id, studentId: student.id,
    startsAt: new Date(now.getTime() - 3600000), durationMin: 30, status: "planned",
  });
  let enter!: (pid: number) => void;
  let release!: () => void;
  const started = new Promise<number>((resolve) => { enter = resolve; });
  const paused = new Promise<void>((resolve) => { release = resolve; });
  const send = sendLessonStatusPrompts(now, async (_chatId, _text, _options, tx) => {
    const { rows: [{ pid }] } = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    enter(pid);
    await paused;
    return true;
  });
  const pid = await Promise.race([started, send.then(() => assert.fail("fixture did not send"))]);
  const observer = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await observer.connect();
  const detach = unlinkStudent(teacher, student.id, version(student));
  try {
    await waitForBlocked(observer, pid);
    const activity = await observer.query("select xact_start from pg_stat_activity where pid = $1", [pid]);
    assert.equal(activity.rows[0]?.xact_start, null);
  } finally {
    release();
    await Promise.allSettled([send, detach]);
    await observer.end();
  }
  assert.equal(await send, 1);
  assert.deepEqual(await detach, { ok: true, changed: true });
  assert.equal(await sendLessonStatusPrompts(now, async () => { assert.fail("stale message reached transport"); }), 0);
});

test("the mailbox holder replaces the registrant's password and sessions before gaining independent control", async () => {
  const teacher = await makeUser({ role: "TEACHER" });
  const fixture = await makeUser();
  const email = `${fixture.id}-new@test.local`;
  const registered = await registerStudent({ name: "New student", email, password: "initial-fixture", consent: true }, "");
  assert.ok("userId" in registered);
  const student = await getUserById(registered.userId);
  assert.ok(student);
  try {
    const linked = await relink(teacher, student);
    const oldToken = await createSessionToken(student.id, student.role, undefined, passwordCredentialVersion(student.passwordHash));
    const [signup] = await db.select().from(s.authTokens)
      .where(and(eq(s.authTokens.userId, student.id), eq(s.authTokens.type, "student_signup_verification")));
    assert.ok(signup);
    const oldTelegramCode = await generateTelegramLinkCode(student.id);
    const oldDevice = "ExponentPushToken[old-fixture-device]";
    assert.equal(await savePushToken(student.id, oldDevice, "android", student.passwordHash), true);
    assert.ok(await getStudentSignupLink(signup.token));
    assert.deepEqual(await verifyEmailAction(signup.token), { success: false });
    assert.deepEqual(await unlinkStudent(teacher, student.id, version(linked)), { ok: false, error: UNLINK_CREDENTIALS });
    assert.equal(await completeStudentSignup(signup.token, "initial-fixture"), false);
    assert.equal(await completeStudentSignup(signup.token, "mailbox-holder-fixture"), true);
    assert.equal(await completeStudentSignup(signup.token, "other-fixture-password"), false);
    assert.deepEqual(await unlinkStudent(teacher, student.id, version(linked)), { ok: false, error: UNLINK_CREDENTIALS });
    const oldSession = await verifySessionToken(oldToken);
    assert.ok(oldSession);
    assert.equal(isSessionRevoked(await readUser(student), oldSession.issuedAt, oldSession.authenticatedAt, oldSession.credentialVersion), true);
    assert.equal(await getBearerUser(new Request("http://local", { headers: { authorization: `Bearer ${oldToken}` } })), null);
    assert.ok("error" in await passwordLogin(email, "initial-fixture", ""));
    assert.equal(await linkTelegramAccountByCode(oldTelegramCode, "synthetic-old-chat"), false);
    assert.equal(await savePushToken(student.id, oldDevice, "android", student.passwordHash), false);
    assert.deepEqual(await db.select().from(s.pushTokens).where(eq(s.pushTokens.userId, student.id)), []);
    assert.ok("user" in await passwordLogin(email, "mailbox-holder-fixture", ""));
    assert.deepEqual(await unlinkStudent(teacher, student.id, version(linked)), { ok: true, changed: true });
  } finally {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL planimetrika.allow_student_account_delete = 'approved'`);
      await tx.delete(s.studentUnlinks).where(eq(s.studentUnlinks.studentId, student.id));
      await tx.delete(s.users).where(eq(s.users.id, student.id));
    });
  }
});

test("real question and review producers cancel both transports on unlink and keep student history", async () => {
  const teacher = await makeUser({ role: "TEACHER", telegramChatId: "producer-fixture" });
  const student = await makeUser({ teacherId: teacher.id, independentCredentials: true });
  const [problem] = await db.select().from(s.problems).where(and(eq(s.problems.answerType, "DETAILED"), sql`${s.problems.skillId} is not null`)).limit(1);
  assert.ok(problem);
  const deliveries: Parameters<Parameters<typeof withNotificationDelivery>[0]>[0][] = [];
  await withNotificationDelivery((deliver) => deliveries.push(deliver), async () => {
    assert.deepEqual(await performAskTeacher(student, problem.id, "Synthetic question", ""), { ok: true });
    assert.deepEqual(await performSubmitAttempt(student, problem.id, "Synthetic solution", "lesson"), { kind: "pending" });
  });
  assert.equal(deliveries.length, 2);
  assert.deepEqual(await unlinkStudent(teacher, student.id, version(student)), { ok: true, changed: true });
  const linked = await relink(teacher, student);
  assert.notEqual(version(linked), version(student));
  let calls = 0;
  const send = async () => { calls++; return true; };
  for (const deliver of deliveries) assert.equal(await deliver({ push: send, telegram: send }), false);
  assert.equal(calls, 0);
  assert.equal((await db.select().from(s.attempts).where(eq(s.attempts.studentId, student.id))).length, 1);
  assert.equal((await db.select().from(s.studentQuestions).where(eq(s.studentQuestions.studentId, student.id))).length, 1);
});

test("individual and group Telegram callbacks skip edits if unlink commits after attendance was saved", async () => {
  const teacher = await makeUser({ role: "TEACHER", telegramChatId: "synthetic-callback" });
  for (const group of [false, true]) {
    const student = await makeUser({ teacherId: teacher.id, independentCredentials: true });
    const lessonId = `callback_${student.id}`;
    const groupLessonId = group ? `group_${student.id}` : null;
    await db.insert(s.scheduledLessons).values({
      id: lessonId, groupLessonId, teacherId: teacher.id, studentId: student.id,
      startsAt: new Date(Date.now() - 3600000),
    });
    const telegramCalls: string[] = [];
    await handleCallbackQuery({
      id: "synthetic", data: group ? `lg:d:${groupLessonId}` : `ls:d:${lessonId}`,
      message: { chat: { id: teacher.telegramChatId }, message_id: 42 },
    }, {
      markLesson: async (...args) => {
        const result = await applyLessonStatus(...args);
        assert.ok(result.ok);
        assert.deepEqual(await unlinkStudent(teacher, student.id, version(student)), { ok: true, changed: true });
        return result;
      },
      telegram: async (method) => { telegramCalls.push(method); return true; },
    });
    assert.deepEqual(telegramCalls, ["answerCallbackQuery"]);
    const [lesson] = await db.select().from(s.scheduledLessons).where(eq(s.scheduledLessons.id, lessonId));
    assert.equal(lesson.status, "done");
    assert.ok(lesson.archivedAt);
  }
});

test("a teacher-created parent request cannot expose student data after detach", async () => {
  const teacher = await makeUser({ role: "TEACHER" });
  const student = await makeUser({ teacherId: teacher.id, independentCredentials: true });
  const fixture = await makeUser({ role: "PARENT", passwordHash: await hashPassword("legacy-teacher-known") });
  await db.insert(s.parentLinkRequests).values({ parentId: fixture.id, studentId: student.id });
  const email = fixture.email.replace("@", "-request@");
  const proposed = "known-to-teacher-fixture";
  const response = await action(teacher, "addParent", { studentId: student.id, name: "Parent", email, password: proposed, consent: "on" });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).result.password, undefined);
  const [row] = await db.select().from(s.users).where(eq(s.users.email, email));
  assert.ok(row);
  try {
    const parent = await getUserById(row.id);
    assert.ok(parent);
    const path = `/api/m/parent?view=child&id=${student.id}`;
    const oldSession = await request(path, parent);
    assert.ok("error" in await passwordLogin(email, proposed, ""));
    assert.equal((await parentData(oldSession)).status, 404);
    assert.equal(await issueParentAccess(teacher, student.id, parent.id), null);
    assert.deepEqual(await unlinkStudent(teacher, student.id, version(student)), { ok: true, changed: true });
    assert.equal((await parentData(oldSession)).status, 404);
    assert.ok("user" in await passwordLogin(fixture.email, "legacy-teacher-known", ""));
    assert.equal((await parentData(await request(path, fixture))).status, 404);
    const [pending] = await db.select().from(s.parentLinkRequests).where(eq(s.parentLinkRequests.parentId, parent.id));
    assert.equal(pending.verifiedAt, null);
    const oldRecovery = await createAuthToken(parent.id, "password_reset", 60_000);
    const issued = await issueParentAccess({ isAdmin: true, isPlatformOwner: true }, student.id, parent.id);
    assert.ok(issued);
    const confirmations = await Promise.all([
      confirmParentAccess(issued.code, "independent-parent-fixture"),
      confirmParentAccess(issued.code, "independent-parent-fixture"),
    ]);
    assert.deepEqual(confirmations.sort(), [false, true]);
    assert.equal((await parentData(oldSession)).status, 401);
    assert.equal(await parentChild(parent, student.id), null);
    assert.equal(await consumeAuthToken(oldRecovery, "password_reset"), null);
    assert.ok("user" in await passwordLogin(email, "independent-parent-fixture", ""));
    assert.equal((await parentData(await request(path, parent))).status, 200);
  } finally {
    await db.delete(s.users).where(eq(s.users.id, row.id));
  }
});

test("evening reminders drop a Telegram recipient when account handoff commits before delivery", async () => {
  const teacher = await makeUser({ role: "TEACHER" });
  const student = await makeUser({ teacherId: teacher.id, telegramChatId: "handoff-fixture", passwordHash: await hashPassword("old-fixture-password") });
  const code = await issueStudentHandoff({ id: "owner", isAdmin: true, isPlatformOwner: true }, student.id);
  assert.ok(code);
  let built = false;
  const sent = await sendStudentEveningReminders(new Date("2026-11-26T19:30:00+03:00"), {
    build: async (recipient) => {
      if (recipient.id !== student.id) return null;
      built = true;
      assert.ok(await redeemStudentHandoff(student.id, code, "new-fixture-password"));
      return { title: "Reminder", text: "Synthetic reminder", link: "/student" };
    },
    telegram: async () => assert.fail("revoked Telegram recipient reached the transport"),
    push: async () => assert.fail("revoked account delivery reached the transport"),
  });
  assert.equal(built, true);
  assert.equal(sent, 0);
  assert.equal((await readUser(student)).telegramChatId, undefined);
});
