import { getSessionUser } from "@/lib/auth";
import {
  computeOverallStats,
  computeXp,
  computeStreak,
  getLevelInfo,
  getAchievementStats,
  isStandaloneStudent,
  isEffectivelyPro,
} from "@/lib/queries";
import { computeAchievementProgress } from "@/lib/achievements";
import { isTelegramConfigured } from "@/lib/telegram";
import { connectTelegramAction, disconnectTelegramAction } from "@/app/actions-telegram";
import AppHeader from "@/components/AppHeader";
import Mascot from "@/components/Mascot";
import { IconCrown } from "@/components/icons";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: { telegram?: string; error?: string };
}) {
  const user = (await getSessionUser())!;
  const xp = await computeXp(user.id);
  const streak = await computeStreak(user.id);
  const level = getLevelInfo(xp);
  const stats = await computeOverallStats(user.id);
  const achievementStats = await getAchievementStats(user.id);
  const progress = computeAchievementProgress(achievementStats);
  const earnedCount = progress.filter((p) => p.tierIndex >= 0).length;
  const topAchievements = [...progress].sort((a, b) => b.tierIndex - a.tierIndex).slice(0, 4);

  const standalone = isStandaloneStudent(user);
  const pro = standalone && isEffectivelyPro(user);
  const memberSince = new Date(user.createdAt).toLocaleDateString("ru-RU", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-screen pb-16">
      <AppHeader
        user={user}
        gamification={{ xp, streak }}
        crumbs={[{ label: "Путь обучения", href: "/student" }, { label: "Профиль" }]}
      />
      <main className="mx-auto max-w-2xl px-4">
        <div className="mb-6 flex items-center gap-4">
          <Mascot mood="happy" size={84} float={false} />
          <div>
            <h1 className="font-display text-2xl font-black text-ink">{user.name}</h1>
            <p className="text-xs text-ink-soft">С нами с {memberSince}</p>
            {pro && (
              <span className="mt-1 inline-flex items-center gap-1 rounded-pill bg-gradient-to-r from-amber to-coral px-2.5 py-1 text-[11px] font-extrabold text-white">
                <IconCrown className="h-3 w-3" /> PRO
              </span>
            )}
          </div>
        </div>

        <div className="card mb-6 p-5">
          <div className="flex items-center justify-between">
            <p className="font-display text-lg font-black text-ink">{level.title}</p>
            <p className="text-xs font-bold text-ink-soft">
              {level.nextLevelMinXp !== null ? `${level.xp} / ${level.nextLevelMinXp} XP` : `${level.xp} XP · максимум`}
            </p>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-pill bg-grid">
            <div
              className="h-full rounded-pill bg-gradient-to-r from-teal to-pine transition-all"
              style={{ width: `${level.progressPct}%` }}
            />
          </div>
        </div>

        <div className="mb-6 grid grid-cols-3 gap-3">
          <StatChip label="Решено задач" value={`${stats.solvedProblems}`} />
          <StatChip label="Точность" value={`${stats.accuracy}%`} />
          <StatChip label="Дней подряд" value={`${streak}`} />
        </div>

        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-black text-ink">Достижения</h2>
          <a href="/student/achievements" className="text-xs font-bold text-pine hover:underline">
            Все ({earnedCount}/{progress.length}) →
          </a>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {topAchievements.map((p) => {
            const earned = p.tierIndex >= 0;
            return (
              <div key={p.def.id} className="card flex flex-col items-center p-3 text-center">
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-full text-xl ${
                    earned ? "bg-gradient-to-br from-amber to-coral" : "bg-line grayscale"
                  }`}
                >
                  {p.def.icon}
                </div>
                <p className="mt-1.5 line-clamp-2 text-[10px] font-bold leading-tight text-ink">
                  {p.def.title}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-6 card p-5">
          <h2 className="mb-1 font-display text-base font-black text-ink">Уведомления в Telegram</h2>
          {searchParams.telegram === "disconnected" && (
            <p className="mb-2 text-xs font-bold text-coral">Telegram отключён.</p>
          )}
          {searchParams.error === "telegram_not_configured" && (
            <p className="mb-2 text-xs font-bold text-coral">
              Telegram-уведомления пока не настроены на сервере.
            </p>
          )}
          {user.telegramChatId ? (
            <>
              <p className="mb-3 text-sm text-ink-soft">
                ✅ Подключено — новые задания, пробники и результаты проверки
                будут приходить и сюда, и в приложение.
              </p>
              <form action={disconnectTelegramAction}>
                <button type="submit" className="btn-secondary !text-xs !text-coral">
                  Отключить
                </button>
              </form>
            </>
          ) : (
            <>
              <p className="mb-3 text-sm text-ink-soft">
                Получай уведомления о новых заданиях, пробниках и проверке решений
                прямо в Telegram — не нужно заходить в приложение, чтобы не пропустить.
              </p>
              {isTelegramConfigured() ? (
                <form action={connectTelegramAction}>
                  <button type="submit" className="btn-primary !text-xs">
                    Подключить Telegram
                  </button>
                </form>
              ) : (
                <p className="text-xs text-ink-soft/70">Пока недоступно.</p>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-3 py-3 text-center">
      <p className="font-mono text-lg font-semibold leading-none text-ink">{value}</p>
      <p className="mt-1 text-[10px] text-ink-soft">{label}</p>
    </div>
  );
}
