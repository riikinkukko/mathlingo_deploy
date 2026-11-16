import { test, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db } from "../../lib/db/client";
import * as schema from "../../lib/db/schema";
import { createStudentForTeacher, parseImport, translitLogin } from "../../lib/student-accounts";
import { isLoginOnlyEmail } from "../../lib/email";
import { verifyPassword } from "../../lib/auth";
import { makeUser, cleanup } from "../helpers";

after(cleanup);

test("разбор списка из таблицы: имя, email, класс, цена в любом порядке; заголовок пропускается", () => {
  const rows = parseImport("ФИО\tКласс\tЦена\nМаша Соколова\t11\t2000\nДима Петров; dima@mail.ru; 10 кл; 1 800\nАлина, 9, 1500\n123456789");
  assert.equal(rows.length, 4);
  assert.deepEqual([rows[0].name, rows[0].grade, rows[0].price, rows[0].email], ["Маша Соколова", 11, 2000, null]);
  assert.deepEqual([rows[1].email, rows[1].grade, rows[1].price], ["dima@mail.ru", 10, 1800]);
  assert.deepEqual([rows[2].name, rows[2].grade, rows[2].price], ["Алина", 9, 1500]);
  assert.ok(rows[3].error);
});

test("ученик без email: логин выдаётся, вход по паролю, писем не шлём", async () => {
  assert.equal(translitLogin("Маша Соколова"), "masha.sokolova");
  const t = await makeUser({ role: "TEACHER" });
  const r = await createStudentForTeacher(t, { name: "Маша Соколова", grade: 11, lessonPriceRub: 2000 });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.ok(r.loginOnly);
  assert.match(r.email, /^masha\.sokolova\.\d{4}@u\.planimetrika\.online$/);
  assert.ok(isLoginOnlyEmail(r.email));
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, r.studentId));
  assert.equal(u.teacherId, t.id);
  assert.equal(u.grade, 11);
  assert.equal(u.lessonPriceRub, 2000);
  assert.ok(u.emailVerifiedAt);
  assert.ok(await verifyPassword(r.password, u.passwordHash));
  // Занятый email — не создаём, отдаём существующего (форма пригласит).
  const other = await makeUser();
  const dup = await createStudentForTeacher(t, { name: "Кто-то", email: other.email });
  assert.ok(!dup.ok && dup.existing?.id === other.id);
});

test("выгрузка в Excel: все листы, ученик, занятие и оплата на месте", async () => {
  const ExcelJS = (await import("exceljs")).default;
  const { buildTeacherExport } = await import("../../lib/teacher-export");
  const t = await makeUser({ role: "TEACHER" });
  const r = await createStudentForTeacher(t, { name: "Петя Excel", lessonPriceRub: 1500 });
  assert.ok(r.ok);
  if (!r.ok) return;
  await db.insert(schema.scheduledLessons).values({ id: `xl-${r.studentId}`, teacherId: t.id, studentId: r.studentId, startsAt: new Date("2026-11-10T14:00:00Z"), status: "done", topic: "Логарифмы" });
  await db.insert(schema.studentPayments).values({ id: `xp-${r.studentId}`, teacherId: t.id, studentId: r.studentId, amountRub: 3000, lessonsCount: 2, paidAt: "2026-11-01" });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await buildTeacherExport(t));
  assert.deepEqual(wb.worksheets.map((w) => w.name), ["Ученики", "Занятия", "Оплаты", "Отчёты о занятиях", "Пробники", "Задания"]);
  const st = wb.getWorksheet("Ученики")!.getRow(2);
  assert.equal(st.getCell(1).value, "Петя Excel");
  assert.equal(st.getCell(8).value, 1500); // 3000 оплачено − 1500 за занятие
  const ls = wb.getWorksheet("Занятия")!.getRow(2);
  assert.deepEqual([ls.getCell(1).value, ls.getCell(2).value, ls.getCell(7).value], ["10.11.2026", "17:00", "проведено"]);
  assert.equal(wb.getWorksheet("Оплаты")!.getRow(2).getCell(3).value, 3000);
});

test("вход по короткому логину без домена; телефон в строке замечаем", async () => {
  const { passwordLogin } = await import("../../lib/auth-flows");
  const { displayLogin } = await import("../../lib/email");
  const t = await makeUser({ role: "TEACHER" });
  const r = await createStudentForTeacher(t, { name: "Коля Логинов" });
  assert.ok(r.ok);
  if (!r.ok) return;
  const short = displayLogin(r.email);
  assert.match(short, /^kolya\.loginov\.\d{4}$/);
  const res = await passwordLogin(short.toUpperCase(), r.password, "127.0.0.9");
  assert.ok("user" in res && res.user.id === r.studentId);
  const [row] = parseImport("Маша\t+7 (900) 123-45-67\t11");
  assert.ok(row.phone);
  assert.equal(row.price, null);
});
