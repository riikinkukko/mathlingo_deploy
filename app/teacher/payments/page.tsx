import { getSessionUser } from "@/lib/auth";
import {
  getStudentBalances,
  getIncomeBetween,
  getRecentPaymentsForTeacher,
} from "@/lib/queries";
import { pluralRu } from "@/lib/pluralize";
import { formatRub, formatDateRu, currentMonthRangeMsk, monthNameRu } from "@/lib/money";
import TeacherShell from "@/components/TeacherShell";
import AddPaymentForm from "@/components/AddPaymentForm";
import PaymentHistory from "@/components/PaymentHistory";
import CollapsibleSection from "@/components/CollapsibleSection";
import { balanceLabel, balanceColor } from "@/components/BalanceSummary";

export default async function PaymentsPage() {
  const user = (await getSessionUser())!;
  const [thisFrom, thisTo] = currentMonthRangeMsk(0);
  const [prevFrom, prevTo] = currentMonthRangeMsk(-1);

  const [balances, incomeThis, incomePrev, recent] = await Promise.all([
    getStudentBalances(user.id),
    getIncomeBetween(user.id, thisFrom, thisTo),
    getIncomeBetween(user.id, prevFrom, prevTo),
    getRecentPaymentsForTeacher(user.id),
  ]);

  const debtors = balances.filter((b) => b.balance < 0);
  const debtLessons = debtors.reduce((sum, b) => sum - b.balance, 0);
  // Сначала должники (по размеру долга), потом остальные по имени.
  const sorted = [...balances].sort(
    (a, b) => a.balance - b.balance || a.studentName.localeCompare(b.studentName, "ru")
  );

  return (
    <TeacherShell active="payments" title="Оплаты">
      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-black text-ink">Оплаты</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Учёт оплат занятий от учеников. Проведённые занятия считаются по отметке «Провести» в
            расписании.
          </p>
        </div>

        <div className="mb-6 grid grid-cols-3 gap-3">
          <div className="card px-3 py-3 text-center">
            <p className="font-mono text-lg font-semibold leading-none text-pine-dark">
              {formatRub(incomeThis)}
            </p>
            <p className="mt-1 text-[11px] text-ink-soft">получено за {monthNameRu(0)}</p>
          </div>
          <div className="card px-3 py-3 text-center">
            <p className="font-mono text-lg font-semibold leading-none text-ink">
              {formatRub(incomePrev)}
            </p>
            <p className="mt-1 text-[11px] text-ink-soft">за {monthNameRu(-1)}</p>
          </div>
          <div
            className={`card px-3 py-3 text-center ${debtors.length > 0 ? "border-2 !border-coral bg-coral-light/40" : ""}`}
          >
            <p
              className={`font-mono text-lg font-semibold leading-none ${debtors.length > 0 ? "text-coral" : "text-ink"}`}
            >
              {debtLessons}
            </p>
            <p className="mt-1 text-[11px] text-ink-soft">
              {debtors.length > 0
                ? `${pluralRu(debtLessons, ["занятие", "занятия", "занятий"])} в долг · ${debtors.length} ${pluralRu(debtors.length, ["ученик", "ученика", "учеников"])}`
                : "долгов нет"}
            </p>
          </div>
        </div>

        {balances.length === 0 ? (
          <div className="card p-8 text-center text-sm text-ink-soft">
            Сначала добавьте учеников — тогда сможете вести учёт оплат.
            <div className="mt-4">
              <a href="/teacher/students/new" className="btn-primary">
                + Добавить ученика
              </a>
            </div>
          </div>
        ) : (
          <>
            <CollapsibleSection title="Записать оплату" defaultOpen={recent.length === 0}>
              <AddPaymentForm students={balances.map((b) => ({ id: b.studentId, name: b.studentName }))} />
            </CollapsibleSection>

            <h2 className="mb-3 mt-6 font-display text-lg font-black text-ink">Балансы учеников</h2>
            <div className="mb-8 space-y-2">
              {sorted.map((b) => (
                <a
                  key={b.studentId}
                  href={`/teacher/student/${b.studentId}`}
                  className={`card flex flex-wrap items-center justify-between gap-3 p-3.5 transition hover:border-pine ${
                    b.balance < 0 ? "border-l-4 !border-l-coral" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-display text-sm font-black text-ink">{b.studentName}</p>
                    <p className="text-[11px] text-ink-soft">
                      оплачено {b.paidLessons} · проведено {b.doneLessons}
                      {b.lastPaidAt && ` · последняя оплата ${formatDateRu(b.lastPaidAt)}`}
                    </p>
                  </div>
                  <span className={`text-sm font-bold ${balanceColor(b.balance)}`}>
                    {balanceLabel(b.balance)}
                  </span>
                </a>
              ))}
            </div>

            <h2 className="mb-3 font-display text-lg font-black text-ink">Последние оплаты</h2>
            <PaymentHistory payments={recent} showStudent from="payments" />
          </>
        )}
      </main>
    </TeacherShell>
  );
}
