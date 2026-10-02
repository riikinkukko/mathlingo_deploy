"use client";

import { deleteStudentPaymentAction } from "@/app/actions-student-payments";

export default function DeletePaymentButton({
  paymentId,
  from,
}: {
  paymentId: string;
  from: "student" | "payments";
}) {
  return (
    <form action={deleteStudentPaymentAction}>
      <input type="hidden" name="paymentId" value={paymentId} />
      <input type="hidden" name="from" value={from} />
      <button
        type="submit"
        aria-label="Удалить оплату"
        onClick={(e) => {
          if (!window.confirm("Удалить эту запись об оплате?")) e.preventDefault();
        }}
        className="flex h-10 w-10 items-center justify-center rounded-pill text-[15px] font-bold text-coral transition hover:bg-coral-light lg:h-8 lg:w-8"
      >
        ✕
      </button>
    </form>
  );
}
