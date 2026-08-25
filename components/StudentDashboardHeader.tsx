import Mascot from "./Mascot";
import NotificationBell from "./NotificationBell";
import { IconGrid } from "./icons";
import { getNotificationsForUser, getUnreadNotificationCount } from "@/lib/queries";

export default async function StudentDashboardHeader({
  userId,
  levelTitle,
  xp,
  streak,
  energy,
  energyMax,
  dailyGoal,
}: {
  userId: string;
  levelTitle: string;
  xp: number;
  streak: number;
  energy: number | null; // null — безлимит (ученик репетитора / Pro)
  energyMax: number;
  dailyGoal: { done: number; total: number };
}) {
  const notifications = await getNotificationsForUser(userId);
  const unreadCount = await getUnreadNotificationCount(userId);
  const goalPct = Math.round((dailyGoal.done / dailyGoal.total) * 100);

  return (
    <header className="border-b border-line-soft bg-paper px-[18px] pb-3 pt-[max(14px,var(--safe-area-inset-top,env(safe-area-inset-top)))]">
      <div className="flex items-center justify-between">
        <a href="/student/profile" className="flex items-center gap-2.5">
          <Mascot mood="idle" size={40} float={false} />
          {/* Звание вместо названия текущей главы — мотивирует прогрессом
              самого ученика, а не нейтрально называет тему урока. */}
          <span className="font-display text-[15px] font-black text-pine-dark">{levelTitle}</span>
        </a>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 rounded-pill bg-amber-light px-2.5 py-[5px] text-[12.5px] font-black text-amber-text">
            ⚡ {xp}
          </span>
          <span className="flex items-center gap-1 rounded-pill bg-coral-light px-2.5 py-[5px] text-[12.5px] font-black text-coral-text">
            🔥 {streak}
          </span>
          {energy !== null && (
            <a
              href="/student/upgrade"
              className="flex items-center gap-1 rounded-pill bg-teal-light px-2.5 py-[5px] text-[12.5px] font-black text-teal-text"
            >
              ⚡ {energy}/{energyMax}
            </a>
          )}
          <a
            href="/student/subjects"
            aria-label="Все предметы"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-white text-ink-soft transition hover:border-pine hover:text-pine"
          >
            <IconGrid className="h-4 w-4" />
          </a>
          <NotificationBell initialNotifications={notifications} initialUnread={unreadCount} />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2.5">
        <div className="h-2 flex-1 overflow-hidden rounded-pill bg-grid">
          <div
            className="h-full rounded-pill bg-pine transition-all"
            style={{ width: `${goalPct}%` }}
          />
        </div>
        <span className="shrink-0 text-[12px] font-black text-ink-soft">
          Цель дня {dailyGoal.done}/{dailyGoal.total}
        </span>
      </div>
    </header>
  );
}
