import { StudentPayment } from "@/lib/types";
import PaymentRow from "./PaymentRow";

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
        <PaymentRow key={p.id} payment={p} showStudent={showStudent} from={from} />
      ))}
    </div>
  );
}
