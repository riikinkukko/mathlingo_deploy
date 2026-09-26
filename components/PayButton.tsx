"use client";

import { ymGoal } from "@/lib/ym";

/** Кнопка отправки формы оплаты. По клику шлёт цель payment_started, затем
 * форма отправляется как обычно (type=submit). Нужна отдельным клиентским
 * компонентом, потому что сами формы оплаты — в серверных страницах. */
export default function PayButton({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button type="submit" className={className} onClick={() => ymGoal("payment_started")}>
      {children}
    </button>
  );
}
