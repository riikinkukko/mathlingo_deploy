import { requireAdmin } from "@/lib/auth";
import { getAllPaymentsForAdmin } from "@/lib/queries";

const STATUS_LABEL: Record<string, string> = {
  pending: "Ожидает оплаты",
  succeeded: "Оплачен",
  canceled: "Отменён",
};

export default async function AdminPaymentsPage() {
  await requireAdmin();
  const payments = await getAllPaymentsForAdmin();
  const succeededTotal = payments
    .filter((p) => p.status === "succeeded")
    .reduce((sum, p) => sum + p.amountRub, 0);

  return (
    <div className="min-h-screen bg-paper pb-16">
      <header className="border-b border-line bg-white px-4 pb-4 pt-[max(1rem,var(--safe-area-inset-top,env(safe-area-inset-top)))]">
        <div className="mx-auto max-w-3xl">
          <a href="/admin" className="text-xs font-bold text-ink-soft hover:underline">
            ← Все пользователи
          </a>
          <h1 className="mt-1 font-display text-xl font-black text-ink">Все платежи</h1>
          <p className="text-xs text-ink-soft">
            Оплачено успешно: {succeededTotal.toLocaleString("ru-RU")} ₽
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pt-6">
        {payments.length === 0 ? (
          <p className="text-sm text-ink-soft">Платежей через ЮKassa пока не было.</p>
        ) : (
          <div className="space-y-2">
            {payments.map((p) => (
              <a
                key={p.id}
                href={`/admin/user/${p.userId}`}
                className="card flex items-center justify-between p-3.5 text-sm transition hover:border-pine"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{p.userEmail}</p>
                  <p className="text-xs text-ink-soft">
                    {p.amountRub} ₽ · {p.periodDays} дн. · {new Date(p.createdAt).toLocaleString("ru-RU")}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-pill px-2.5 py-1 text-xs font-extrabold ${
                    p.status === "succeeded"
                      ? "bg-pine-light text-pine-dark"
                      : p.status === "canceled"
                        ? "bg-coral-light text-coral"
                        : "bg-amber-light text-amber"
                  }`}
                >
                  {STATUS_LABEL[p.status] ?? p.status}
                </span>
              </a>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
