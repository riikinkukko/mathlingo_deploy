import { getSessionUser } from "@/lib/auth";
import { getAchievementStats } from "@/lib/queries";
import { computeAchievementProgress } from "@/lib/achievements";
import StudentShell from "@/components/StudentShell";
import { pluralRu } from "@/lib/pluralize";

export default async function AchievementsPage() {
  const user = (await getSessionUser())!;
  const stats = await getAchievementStats(user.id);
  const progress = computeAchievementProgress(stats);

  const totalTiers = progress.reduce((sum, p) => sum + p.def.tiers.length, 0);
  const earnedTiers = progress.reduce((sum, p) => sum + (p.tierIndex + 1), 0);

  return (
    <StudentShell active="profile" title="Достижения">
      <div className="px-4 py-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-1 font-display text-2xl font-black text-ink">Достижения</h1>
        <p className="mb-6 text-sm text-ink-soft">
          Получено {earnedTiers} из {totalTiers} {pluralRu(totalTiers, ["уровня", "уровней", "уровней"])}
        </p>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {progress.map((p) => {
            const earned = p.tierIndex >= 0;
            const maxed = p.nextThreshold === null;
            return (
              <div key={p.def.id} className="card flex flex-col items-center p-4 text-center">
                <div
                  className={`flex h-16 w-16 items-center justify-center rounded-full text-3xl ${
                    earned ? "bg-gradient-to-br from-amber to-coral" : "bg-line grayscale"
                  }`}
                >
                  {p.def.icon}
                </div>
                <p className="mt-2 text-sm font-bold text-ink">{p.def.title}</p>
                {earned && (
                  <span className="mt-1 rounded-pill bg-amber-light px-2 py-0.5 text-[10px] font-extrabold uppercase text-amber">
                    Уровень {p.tierIndex + 1}
                  </span>
                )}
                <p className="mt-1.5 text-[11px] text-ink-soft">
                  {maxed ? (
                    <>Максимум: {p.value}</>
                  ) : (
                    <>
                      {p.value} / {p.nextThreshold}
                    </>
                  )}
                </p>
                {!maxed && (
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-pill bg-grid">
                    <div
                      className="h-full rounded-pill bg-pine transition-all"
                      style={{ width: `${p.progressPct}%` }}
                    />
                  </div>
                )}
                <p className="mt-2 text-[10px] leading-snug text-ink-soft/70">{p.def.description}</p>
              </div>
            );
          })}
        </div>
      </div>
      </div>
    </StudentShell>
  );
}
