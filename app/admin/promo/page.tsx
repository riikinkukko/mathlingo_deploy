import { desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { promoLabel } from "@/lib/promo";
import { togglePromoAction } from "@/app/actions-promo";
import CreatePromoForm from "./CreatePromoForm";

export const dynamic = "force-dynamic";

function fmt(d: Date | null) {
  return d ? d.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "short", year: "numeric" }) : null;
}

export default async function AdminPromoPage() {
  await requireAdmin();
  const codes = await db.select().from(schema.promoCodes).orderBy(desc(schema.promoCodes.createdAt));
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://planimetrika.online").replace(/\/$/, "");
  const now = Date.now();

  return (
    <div className="min-h-screen bg-paper pb-16">
      <header className="border-b border-line bg-white px-4 pb-4 pt-[max(1rem,var(--app-sat))]">
        <div className="mx-auto max-w-3xl">
          <a href="/admin" className="text-xs font-bold text-ink-soft hover:underline">
            ← Все пользователи
          </a>
          <h1 className="mt-1 font-display text-xl font-black text-ink">Промокоды</h1>
          <p className="text-xs text-ink-soft">
            Ссылка с кодом подставляет его при регистрации: /register/teacher?promo=КОД или /register?promo=КОД
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 pt-6">
        <CreatePromoForm appUrl={appUrl} />

        <section>
          <h2 className="mb-3 font-display text-lg font-black text-ink">Все коды</h2>
          {codes.length === 0 ? (
            <p className="text-sm text-ink-soft">Промокодов пока нет.</p>
          ) : (
            <div className="space-y-2">
              {codes.map((c) => {
                const expired = !!c.expiresAt && c.expiresAt.getTime() <= now;
                const exhausted = c.maxUses !== null && c.usedCount >= c.maxUses;
                const status = !c.active ? "выключен" : expired ? "истёк" : exhausted ? "лимит исчерпан" : "действует";
                return (
                  <div key={c.code} className="card flex flex-wrap items-center justify-between gap-3 p-3.5">
                    <div className="min-w-0">
                      <p className="font-mono text-[15px] font-black text-ink">{c.code}</p>
                      <p className="text-[13px] text-ink-soft">
                        {c.audience === "teacher" ? "Репетиторам" : "Ученикам"}: {promoLabel(c)}. Использован {c.usedCount}
                        {c.maxUses !== null ? ` из ${c.maxUses}` : ""} раз
                        {c.expiresAt ? `, до ${fmt(c.expiresAt)}` : ""}.
                      </p>
                      {c.note && <p className="text-[12px] text-ink-soft">{c.note}</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-[12px] font-black ${status === "действует" ? "text-pine-dark" : "text-ink-soft"}`}>{status}</span>
                      <form action={togglePromoAction}>
                        <input type="hidden" name="code" value={c.code} />
                        <input type="hidden" name="active" value={c.active ? "0" : "1"} />
                        <button type="submit" className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-bold text-ink hover:border-pine">
                          {c.active ? "Выключить" : "Включить"}
                        </button>
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
