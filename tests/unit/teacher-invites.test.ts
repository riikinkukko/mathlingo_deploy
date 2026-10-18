import { test, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db } from "../../lib/db/client";
import * as schema from "../../lib/db/schema";
import {
  inviteEligibility,
  studentLimitError,
  createTeacherInvite,
  respondToTeacherInvite,
  cancelTeacherInvite,
  getPendingInvitesForTeacher,
  getPendingInvitesForStudent,
  countPendingInvitesForStudent,
} from "../../lib/teacher-invites";
import { getUserById } from "../../lib/queries";
import { makeUser, cleanup } from "../helpers";

after(cleanup);

test("кого можно пригласить: только ученика без репетитора и без ожидающего приглашения", () => {
  assert.deepEqual(inviteEligibility({ role: "STUDENT", teacherId: undefined }, "t1", false), { ok: true });
  const same = inviteEligibility({ role: "STUDENT", teacherId: "t1" }, "t1", false);
  assert.ok(!same.ok && same.code === "same_teacher");
  const other = inviteEligibility({ role: "STUDENT", teacherId: "t2" }, "t1", false);
  assert.ok(!other.ok && other.code === "has_teacher");
  const parent = inviteEligibility({ role: "PARENT", teacherId: undefined }, "t1", false);
  assert.ok(!parent.ok && parent.code === "not_student");
  const teacher = inviteEligibility({ role: "TEACHER", teacherId: undefined }, "t1", false);
  assert.ok(!teacher.ok && teacher.code === "not_student");
  const dup = inviteEligibility({ role: "STUDENT", teacherId: undefined }, "t1", true);
  assert.ok(!dup.ok && dup.code === "already_invited");
});

test("лимит учеников по тарифу — тот же, что при добавлении", () => {
  const free = { teacherPlan: undefined, teacherProUntil: undefined, teacherTier: undefined, teacherTrialUntil: undefined, isPlatformOwner: false };
  assert.equal(studentLimitError(free, 2), null);
  assert.match(studentLimitError(free, 3) ?? "", /бесплатном тарифе — до 3/);
  assert.equal(studentLimitError({ ...free, isPlatformOwner: true }, 100), null);
  const trial = { ...free, teacherTrialUntil: new Date(Date.now() + 86400000).toISOString() };
  assert.equal(studentLimitError(trial, 50), null);
});

test("приглашение: создать, увидеть с обеих сторон, принять — прогресс и teacher_id", async () => {
  const teacher = await makeUser({ role: "TEACHER", name: "Анна Сергеевна" });
  const student = await makeUser({ role: "STUDENT" });
  const stranger = await makeUser({ role: "STUDENT" });

  const res = await createTeacherInvite(teacher, student);
  assert.ok(res.ok);
  const inviteId = (res as { inviteId: string }).inviteId;
  // повторно — понятная ошибка, без второй строки
  const again = await createTeacherInvite(teacher, student);
  assert.ok(!again.ok && again.code === "already_invited");

  assert.equal((await getPendingInvitesForTeacher(teacher.id)).length, 1);
  const mine = await getPendingInvitesForStudent(student.id);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].teacherName, "Анна Сергеевна");
  const notes = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, student.id));
  assert.ok(notes.some((n) => n.type === "teacher_invite"));

  // чужое приглашение принять нельзя
  const foreign = await respondToTeacherInvite(stranger.id, inviteId, true);
  assert.ok(!foreign.ok);
  assert.equal((await getUserById(stranger.id))!.teacherId, undefined);

  const ok = await respondToTeacherInvite(student.id, inviteId, true);
  assert.ok(ok.ok);
  assert.equal((await getUserById(student.id))!.teacherId, teacher.id);
  assert.equal(await countPendingInvitesForStudent(student.id), 0);
  // второй раз — уже неактуально
  assert.ok(!(await respondToTeacherInvite(student.id, inviteId, true)).ok);
  // ученик уже в списке — новое приглашение не создаётся
  const linked = await createTeacherInvite(teacher, (await getUserById(student.id))!);
  assert.ok(!linked.ok && linked.code === "same_teacher");
});

test("приглашение: отклонить, отозвать, другой репетитор и лимит тарифа", async () => {
  const teacher = await makeUser({ role: "TEACHER" });
  const teacher2 = await makeUser({ role: "TEACHER" });
  const student = await makeUser({ role: "STUDENT" });

  const r1 = await createTeacherInvite(teacher, student);
  assert.ok(r1.ok);
  const declined = await respondToTeacherInvite(student.id, (r1 as { inviteId: string }).inviteId, false);
  assert.ok(declined.ok);
  assert.equal((await getUserById(student.id))!.teacherId, undefined);

  // после отклонения можно пригласить снова; репетитор может отозвать
  const r2 = await createTeacherInvite(teacher, student);
  assert.ok(r2.ok);
  assert.equal(await cancelTeacherInvite(teacher2.id, (r2 as { inviteId: string }).inviteId), false); // чужое — нельзя
  assert.equal(await cancelTeacherInvite(teacher.id, (r2 as { inviteId: string }).inviteId), true);
  assert.equal(await countPendingInvitesForStudent(student.id), 0);

  // два приглашения: принятие одного закрывает другое
  const a = await createTeacherInvite(teacher, student);
  const b = await createTeacherInvite(teacher2, student);
  assert.ok(a.ok && b.ok);
  assert.ok((await respondToTeacherInvite(student.id, (b as { inviteId: string }).inviteId, true)).ok);
  assert.equal(await countPendingInvitesForStudent(student.id), 0);
  // ученика другого репетитора пригласить нельзя
  const busy = await createTeacherInvite(teacher, (await getUserById(student.id))!);
  assert.ok(!busy.ok && busy.code === "has_teacher");

  // лимит: у бесплатного репетитора уже 3 ученика — принять нельзя, приглашение ждёт
  const full = await makeUser({ role: "TEACHER" });
  for (let i = 0; i < 3; i++) await makeUser({ role: "STUDENT", teacherId: full.id });
  const solo = await makeUser({ role: "STUDENT" });
  const inv = await createTeacherInvite(full, solo);
  assert.ok(inv.ok);
  const blocked = await respondToTeacherInvite(solo.id, (inv as { inviteId: string }).inviteId, true);
  assert.ok(!blocked.ok && /нет свободных мест/.test(blocked.message));
  assert.equal((await getUserById(solo.id))!.teacherId, undefined);
  assert.equal(await countPendingInvitesForStudent(solo.id), 1);
});
