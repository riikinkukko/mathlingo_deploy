import { getStudentBalance } from "./queries";
import type { StudentBalance, User } from "./types";

/**
 * Баланс оплат, который видит родитель (кабинет, приложение, недельный отчёт).
 * Раньше — только если репетитор включил напоминания об оплате, и родитель
 * обычно не видел ничего, хотя на главной это обещано. Теперь — если
 * репетитор ведёт оплаты этого ученика в Планиметрике: включил напоминания,
 * записал хотя бы одну оплату или задал цену занятия.
 */
export async function getParentVisibleBalance(child: Pick<User, "id" | "teacherId" | "paymentRemindersEnabled">): Promise<StudentBalance | undefined> {
  if (!child.teacherId) return undefined;
  const b = await getStudentBalance(child.teacherId, child.id);
  if (!b) return undefined;
  const tracked = !!child.paymentRemindersEnabled || b.paidLessons > 0 || b.paidRub > 0 || b.priceRub !== null;
  return tracked ? b : undefined;
}
