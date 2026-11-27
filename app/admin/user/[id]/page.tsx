import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { parentLinkRequests, users } from "@/lib/db/schema";
import IssueStudentHandoff from "@/components/IssueStudentHandoff";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getUserById, getPaymentsForUser, isEffectivelyPro } from "@/lib/queries";
import { grantProAction, revokeProAction, sendParentConfirmationAction } from "../../actions";

const STATUS_LABEL: Record<string, string> = {
  pending: "Ожидает оплаты",
  succeeded: "Оплачен",
  canceled: "Отменён",
};

export default async function AdminUserPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const operator = await requireAdmin();
  const user = await getUserById(params.id);
  if (!user) notFound();
  const payments = await getPaymentsForUser(user.id);
  const pendingParents = operator.isPlatformOwner && user.role === "STUDENT"
    ? await db.select({ id: users.id, email: users.email }).from(parentLinkRequests)
      .innerJoin(users, eq(users.id, parentLinkRequests.parentId))
      .where(and(eq(parentLinkRequests.studentId, user.id), isNull(parentLinkRequests.verifiedAt)))
    : [];
  const pro = isEffectivelyPro(user);

  return (
    <div className="min-h-screen bg-paper pb-16">
      <header className="pt-5">
        <div className="mx-auto px-4 max-w-4xl">
          <a href="/admin" className="text-xs font-bold text-ink-soft hover:underline">
            ← Все пользователи
          </a>
          <h1 className="mt-1 font-display text-xl font-black text-ink">{user.name}</h1>
          <p className="text-xs text-ink-soft">{user.email}</p>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pt-6">
        <div className="card mb-6 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span
              className={`rounded-pill px-3 py-1.5 text-sm font-extrabold ${
                pro ? "bg-amber text-white" : "bg-line text-ink-soft"
              }`}
            >
              {pro ? "PRO" : "FREE"}
            </span>
            {pro && (
              <span className="text-sm text-ink-soft">
                {user.proUntil ? `до ${new Date(user.proUntil).toLocaleDateString("ru-RU")}` : "бессрочно"}
              </span>
            )}
          </div>

          {pro ? (
            <form action={revokeProAction}>
              <input type="hidden" name="userId" value={user.id} />
              <button type="submit" className="btn-secondary w-full !text-sm !text-coral">
                Отозвать Pro
              </button>
            </form>
          ) : (
            <form action={grantProAction} className="flex gap-2">
              <input type="hidden" name="userId" value={user.id} />
              <input
                type="number"
                name="days"
                placeholder="Дней (пусто = навсегда)"
                className="input flex-1 !text-sm"
                min={1}
              />
              <button type="submit" className="btn-primary !text-sm">
                Выдать Pro
              </button>
            </form>
          )}
        </div>

        {operator.isPlatformOwner && user.role === "STUDENT" && !user.independentCredentials && (
          <IssueStudentHandoff studentId={user.id} />
        )}
        {pendingParents.map((parent) => (
          <form className="card mb-4 space-y-2 p-4 text-sm" action={sendParentConfirmationAction} key={parent.id}>
            <h2 className="font-bold">Подтвердить родителя {parent.email}</h2>
            <input type="hidden" name="studentId" value={user.id} />
            <input type="hidden" name="parentId" value={parent.id} />
            <label className="block"><input type="checkbox" name="parentVerified" required /> Личность родителя и его контроль над этим email проверены независимо от репетитора</label>
            <label className="block"><input type="checkbox" name="studentConsent" required /> Связь согласована с учеником или его законным представителем через проверенный канал</label>
            <button className="btn-primary" type="submit">Отправить ссылку родителю</button>
          </form>
        ))}
        <h2 className="mb-3 font-display text-lg font-black text-ink">История платежей</h2>
        {payments.length === 0 ? (
          <p className="text-sm text-ink-soft">Платежей через ЮKassa пока не было.</p>
        ) : (
          <div className="space-y-2">
            {payments.map((p) => (
              <div key={p.id} className="card flex items-center justify-between p-3.5 text-sm">
                <div>
                  <p className="font-semibold text-ink">{p.amountRub} ₽ · {p.periodDays} дн.</p>
                  <p className="text-xs text-ink-soft">
                    {new Date(p.createdAt).toLocaleString("ru-RU")}
                    {p.paidAt && ` · оплачен ${new Date(p.paidAt).toLocaleString("ru-RU")}`}
                  </p>
                </div>
                <span
                  className={`rounded-pill px-2.5 py-1 text-xs font-extrabold ${
                    p.status === "succeeded"
                      ? "bg-pine-light text-pine-dark"
                      : p.status === "canceled"
                        ? "bg-coral-light text-coral"
                        : "bg-amber-light text-amber"
                  }`}
                >
                  {STATUS_LABEL[p.status] ?? p.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
