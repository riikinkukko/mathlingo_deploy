// Напоминания об оплате занятий — родителям ученика (если родителей нет — самому
// ученику), в уведомления приложения и в Telegram (это делает pushNotification).
//
// Автоматически — после отметки «Провести / Было», ТОЛЬКО если репетитор
// включил напоминания для этого ученика (users.paymentRemindersEnabled):
//   • осталось 1 оплаченное занятие;
//   • оплаченные занятия закончились (0);
//   • долг (баланс < 0) — после каждого следующего проведённого занятия.
// Вручную — кнопкой «Напомнить об оплате» (отправляется всегда).
import { db } from "./db/client";
import { getUserById, getStudentBalance, getParentsOfStudent, pushNotification } from "./queries";
import { pluralRu } from "./pluralize";

const LESSONS: [string, string, string] = ["занятие", "занятия", "занятий"];

type Kind = "auto" | "manual";

function messageFor(balance: number, studentName: string, kind: Kind): { title: string; body: string } | null {
  const first = studentName.split(" ")[0] || studentName;
  if (balance < 0) {
    const n = -balance;
    return {
      title: `Есть неоплаченные занятия — ${first}: ${n} ${pluralRu(n, LESSONS)}`,
      body: "Пожалуйста, оплатите проведённые занятия.",
    };
  }
  if (balance === 0) {
    return {
      title: `Оплаченные занятия закончились — ${first}`,
      body: "Следующее занятие нужно оплатить.",
    };
  }
  if (balance === 1) {
    return {
      title: `Осталось одно оплаченное занятие — ${first}`,
      body: "Чтобы не прерывать занятия, оплатите следующие заранее.",
    };
  }
  // Баланс > 1: автоматически молчим; вручную — просто сообщаем остаток.
  if (kind === "manual") {
    return {
      title: `Оплачено занятий: осталось ${balance} ${pluralRu(balance, LESSONS)} — ${first}`,
      body: "Напоминание от репетитора об оплате занятий.",
    };
  }
  return null;
}

/**
 * Отправляет напоминание об оплате по текущему балансу ученика.
 * Возвращает число получателей (0 — ничего не отправлено).
 */
export async function sendPaymentReminder(teacherId: string, studentId: string, kind: Kind): Promise<number> {
  const [student, teacher] = await Promise.all([getUserById(studentId), getUserById(teacherId)]);
  if (!student || !teacher || student.teacherId !== teacherId) return 0;
  if (kind === "auto" && !student.paymentRemindersEnabled) return 0;

  const balance = await getStudentBalance(teacherId, studentId);
  if (!balance) return 0;

  const msg = messageFor(balance.balance, student.name, kind);
  if (!msg) return 0;

  const how = teacher.paymentInstructions?.trim();
  const body = how ? `${msg.body}\nКак оплатить: ${how}` : msg.body;

  const parents = await getParentsOfStudent(studentId);
  const recipients =
    parents.length > 0
      ? parents.map((p) => ({ userId: p.id, link: `/parent/child/${studentId}` }))
      : [{ userId: studentId, link: "/student" }];

  for (const r of recipients) {
    await pushNotification(db, { userId: r.userId, type: "payment_reminder", title: msg.title, body, link: r.link });
  }
  return recipients.length;
}
