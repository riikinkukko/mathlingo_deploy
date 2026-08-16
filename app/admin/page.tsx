import { requireAdmin } from "@/lib/auth";
import { getAllStandaloneUsersForAdmin, isEffectivelyPro, getEffectiveEnergy, FREE_MAX_ENERGY } from "@/lib/queries";
import { grantProAction, revokeProAction } from "./actions";

export default async function AdminPage() {
  const admin = await requireAdmin();
  const users = await getAllStandaloneUsersForAdmin();

  return (
    <div className="min-h-screen bg-paper pb-16">
      <header className="border-b border-line bg-white px-4 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-widest text-ink-soft">Admin</p>
            <h1 className="font-display text-xl font-black text-ink">Самостоятельные пользователи</h1>
          </div>
          <a href="/admin/payments" className="btn-secondary !text-xs">
            Все платежи
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pt-6">
        <p className="mb-4 text-sm text-ink-soft">
          {users.length} {users.length === 1 ? "пользователь" : "пользователей"} без привязки к репетитору
          (только у них есть понятие тарифа Free/Pro).
        </p>

        <div className="space-y-2">
          {users.map((u) => {
            const pro = isEffectivelyPro(u);
            const energy = Math.floor(getEffectiveEnergy(u));
            return (
              <div key={u.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <a href={`/admin/user/${u.id}`} className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">{u.name}</p>
                  <p className="text-xs text-ink-soft">{u.email}</p>
                </a>
                <div className="flex shrink-0 items-center gap-3 text-xs">
                  <span
                    className={`rounded-pill px-2.5 py-1 font-extrabold ${
                      pro ? "bg-amber text-white" : "bg-line text-ink-soft"
                    }`}
                  >
                    {pro ? "PRO" : "FREE"}
                  </span>
                  {!pro && <span className="text-ink-soft">{energy}/{FREE_MAX_ENERGY} энергии</span>}
                  {pro && u.proUntil && (
                    <span className="text-ink-soft">
                      до {new Date(u.proUntil).toLocaleDateString("ru-RU")}
                    </span>
                  )}
                  {pro && !u.proUntil && <span className="text-ink-soft">бессрочно</span>}
                </div>
                <div className="flex shrink-0 gap-2">
                  {pro ? (
                    <form action={revokeProAction}>
                      <input type="hidden" name="userId" value={u.id} />
                      <button type="submit" className="text-xs font-bold text-coral hover:underline">
                        Отозвать Pro
                      </button>
                    </form>
                  ) : (
                    <form action={grantProAction} className="flex items-center gap-1.5">
                      <input type="hidden" name="userId" value={u.id} />
                      <input
                        type="number"
                        name="days"
                        placeholder="дней (пусто=навсегда)"
                        className="input !w-32 !py-1 !text-xs"
                        min={1}
                      />
                      <button type="submit" className="text-xs font-bold text-pine hover:underline">
                        Выдать Pro
                      </button>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
          {users.length === 0 && (
            <p className="text-sm text-ink-soft">Пока нет ни одного самостоятельного пользователя.</p>
          )}
        </div>
      </main>
    </div>
  );
}
