import Mascot from "./Mascot";
import NotificationBell from "./NotificationBell";
import { getNotificationsForUser, getUnreadNotificationCount } from "@/lib/queries";

export default async function StudentDashboardHeader({
  userId,
  chapterTitle,
  streak,
  energy,
  energyMax,
  dailyGoal,
}: {
  userId: string;
  chapterTitle: string;
  streak: number;
  energy: number | null; // null — безлимит (ученик репетитора / Pro)
  energyMax: number;
  dailyGoal: { done: number; total: number };
}) {
  const notifications = await getNotificationsForUser(userId);
  const unreadCount = await getUnreadNotificationCount(userId);
  const goalPct = Math.round((dailyGoal.done / dailyGoal.total) * 100);

  return (
    <header className="border-b border-line-soft bg-paper px-[18px] pb-3 pt-[14px]">
      <div className="flex items-center justify-between">
        <a href="/student" className="flex items-center gap-2.5">
          <Mascot mood="idle" size={40} float={false} />
          <span className="font-display text-[15px] font-black text-pine-dark">{chapterTitle}</span>
        </a>
        <div className="flex items-center gap-2">
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
