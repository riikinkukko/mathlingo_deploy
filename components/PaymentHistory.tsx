import { StudentPayment } from "@/lib/types";
import { formatRub, formatDateRu } from "@/lib/money";
import { pluralRu } from "@/lib/pluralize";
import DeletePaymentButton from "./DeletePaymentButton";

type Item = StudentPayment & { studentName?: string };

export default function PaymentHistory({
  payments,
  showStudent,
  from,
  emptyText = "Оплат пока не записано.",
}: {
  payments: Item[];
  showStudent: boolean;
  from: "student" | "payments";
  emptyText?: string;
}) {
  if (payments.length === 0) {
    return <div className="card p-6 text-center text-sm text-ink-soft">{emptyText}</div>;
  }
  return (
    <div className="space-y-2">
      {payments.map((p) => (
        <div key={p.id} className="card flex flex-wrap items-center gap-3 p-3.5">
          <div className="min-w-[88px]">
            <p className="font-mono text-sm font-bold text-ink">{formatRub(p.amountRub)}</p>
            <p className="text-[11px] text-ink-soft">{formatDateRu(p.paidAt)}</p>
          </div>
          <div className="min-w-0 flex-1">
            {showStudent && p.studentName && (
              <p className="font-display text-sm font-black text-ink">{p.studentName}</p>
            )}
            <p className="text-xs text-ink-soft">
              {p.lessonsCount > 0
                ? `за ${p.lessonsCount} ${pluralRu(p.lessonsCount, ["занятие", "занятия", "занятий"])}`
                : "без привязки к занятиям"}
              {p.note && <span> · {p.note}</span>}
            </p>
          </div>
          <DeletePaymentButton paymentId={p.id} from={from} />
        </div>
      ))}
    </div>
  );
}
