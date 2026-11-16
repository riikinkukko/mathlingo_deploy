import ExcelJS from "exceljs";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { getStudentBalances, getStudentsOfTeacher, homeworkStatus, mapHomework } from "@/lib/queries";
import { isLoginOnlyEmail } from "@/lib/email";
import type { User } from "@/lib/types";

const STATUS: Record<string, string> = { planned: "запланировано", done: "проведено", cancelled: "отменено", missed: "не пришёл" };
const KIND: Record<string, string> = { homework: "домашка", test: "контрольная", exam: "пробник" };

function msk(d: Date): { date: string; time: string } {
  const f = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.day}.${p.month}.${p.year}`, time: `${p.hour}:${p.minute}` };
}
const ruDate = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join(".") : iso);

function sheet(wb: ExcelJS.Workbook, name: string, cols: { header: string; key: string; width: number }[], rows: Record<string, unknown>[]) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = cols;
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F3EE" } };
  for (const r of rows) ws.addRow(r);
  ws.eachRow((row, i) => {
    if (i > 1) row.alignment = { vertical: "top", wrapText: true };
  });
  if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  return ws;
}

/** Все данные репетитора одной книгой Excel: ученики, занятия, оплаты, отчёты, пробники, задания. */
export async function buildTeacherExport(teacher: User): Promise<Buffer> {
  const tid = teacher.id;
  const [students, balances, groups, lessons, pays, logs, mocks, hws] = await Promise.all([
    getStudentsOfTeacher(tid),
    getStudentBalances(tid),
    db.select().from(schema.studentGroups).where(eq(schema.studentGroups.teacherId, tid)),
    db.select().from(schema.scheduledLessons).where(eq(schema.scheduledLessons.teacherId, tid)).orderBy(desc(schema.scheduledLessons.startsAt)),
    db.select().from(schema.studentPayments).where(eq(schema.studentPayments.teacherId, tid)).orderBy(desc(schema.studentPayments.paidAt)),
    db.select().from(schema.lessonLogs).where(eq(schema.lessonLogs.teacherId, tid)).orderBy(desc(schema.lessonLogs.date)),
    db.select().from(schema.mockScores).where(eq(schema.mockScores.teacherId, tid)).orderBy(desc(schema.mockScores.takenAt)),
    db.select().from(schema.homeworks).where(eq(schema.homeworks.teacherId, tid)).orderBy(desc(schema.homeworks.createdAt)).limit(500),
  ]);
  const name = new Map(students.map((s) => [s.id, s.name]));
  const bal = new Map(balances.map((b) => [b.studentId, b]));
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const notes = await db.select().from(schema.studentNotes).where(and(eq(schema.studentNotes.teacherId, tid)));
  const noteOf = new Map(notes.map((n) => [n.studentId, n.notes]));
  const nm = (id: string | null) => (id ? name.get(id) ?? "(ученик удалён из списка)" : "");

  const wb = new ExcelJS.Workbook();
  wb.creator = "Планиметрика";
  wb.created = new Date();

  sheet(
    wb,
    "Ученики",
    [
      { header: "Ученик", key: "name", width: 26 },
      { header: "Логин / email", key: "email", width: 34 },
      { header: "Класс", key: "grade", width: 8 },
      { header: "Цель ЕГЭ", key: "target", width: 10 },
      { header: "Цена занятия, ₽", key: "price", width: 15 },
      { header: "Оплачено, ₽", key: "paidRub", width: 13 },
      { header: "Проведено занятий", key: "done", width: 12 },
      { header: "Баланс, ₽ (минус — долг)", key: "balRub", width: 16 },
      { header: "Баланс, занятий", key: "bal", width: 12 },
      { header: "Заметки", key: "notes", width: 50 },
    ],
    students.map((s) => {
      const b = bal.get(s.id);
      return {
        name: s.name,
        email: s.email + (isLoginOnlyEmail(s.email) ? " (логин)" : ""),
        grade: s.grade ?? "",
        target: s.targetScore ?? "",
        price: s.lessonPriceRub ?? "",
        paidRub: b?.paidRub ?? 0,
        done: b?.doneLessons ?? 0,
        balRub: b?.balanceRub ?? "",
        bal: b?.balance ?? 0,
        notes: noteOf.get(s.id) ?? "",
      };
    })
  );

  sheet(
    wb,
    "Занятия",
    [
      { header: "Дата", key: "date", width: 12 },
      { header: "Время", key: "time", width: 8 },
      { header: "Ученик", key: "name", width: 26 },
      { header: "Группа", key: "group", width: 18 },
      { header: "Длительность, мин", key: "dur", width: 12 },
      { header: "Тема", key: "topic", width: 34 },
      { header: "Статус", key: "status", width: 15 },
      { header: "Цена, ₽", key: "price", width: 10 },
    ],
    lessons.map((l) => {
      const t = msk(l.startsAt);
      return { date: t.date, time: t.time, name: nm(l.studentId), group: l.groupId ? groupName.get(l.groupId) ?? "" : "", dur: l.durationMin, topic: l.topic ?? "", status: STATUS[l.status] ?? l.status, price: l.priceRub ?? "" };
    })
  );

  sheet(
    wb,
    "Оплаты",
    [
      { header: "Дата", key: "date", width: 12 },
      { header: "Ученик", key: "name", width: 26 },
      { header: "Сумма, ₽", key: "amount", width: 12 },
      { header: "Занятий", key: "count", width: 9 },
      { header: "Комментарий", key: "note", width: 40 },
    ],
    pays.map((p) => ({ date: ruDate(p.paidAt), name: nm(p.studentId), amount: p.amountRub, count: p.lessonsCount, note: p.note ?? "" }))
  );

  sheet(
    wb,
    "Отчёты о занятиях",
    [
      { header: "Дата", key: "date", width: 12 },
      { header: "Ученик", key: "name", width: 26 },
      { header: "Тема", key: "topic", width: 30 },
      { header: "Отчёт", key: "report", width: 80 },
    ],
    logs.map((l) => ({ date: ruDate(l.date), name: nm(l.studentId), topic: l.topic, report: l.report }))
  );

  sheet(
    wb,
    "Пробники",
    [
      { header: "Дата", key: "date", width: 12 },
      { header: "Ученик", key: "name", width: 26 },
      { header: "Балл", key: "score", width: 8 },
      { header: "Комментарий", key: "note", width: 40 },
    ],
    mocks.map((m) => ({ date: ruDate(m.takenAt), name: nm(m.studentId), score: m.score, note: m.note ?? "" }))
  );

  const hwRows: Record<string, unknown>[] = [];
  for (const h of hws) {
    if (!h.studentId) continue;
    const st = await homeworkStatus(mapHomework(h), h.studentId);
    hwRows.push({
      created: msk(h.createdAt).date,
      due: msk(h.dueDate).date,
      name: nm(h.studentId),
      title: h.title,
      kind: KIND[h.kind] ?? h.kind,
      progress: `${st.done} из ${st.total}`,
      state: st.complete ? "сдано" : st.overdue ? "просрочено" : "в работе",
    });
  }
  sheet(
    wb,
    "Задания",
    [
      { header: "Выдано", key: "created", width: 12 },
      { header: "Срок", key: "due", width: 12 },
      { header: "Ученик", key: "name", width: 26 },
      { header: "Задание", key: "title", width: 34 },
      { header: "Тип", key: "kind", width: 12 },
      { header: "Решено", key: "progress", width: 10 },
      { header: "Состояние", key: "state", width: 13 },
    ],
    hwRows
  );

  return Buffer.from(await wb.xlsx.writeBuffer());
}
