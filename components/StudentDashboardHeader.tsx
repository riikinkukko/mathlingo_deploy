import Mascot from "./Mascot";
import NotificationBell from "./NotificationBell";
import MobileAppBar from "./MobileAppBar";
import { IconGrid, IconBolt, IconFlame, IconBattery } from "./icons";
import { getNotificationsForUser, getUnreadNotificationCount } from "@/lib/queries";

/**
 * Шапка главной ученика на телефоне — та же MobileAppBar (56 px), что и на
 * остальных экранах. Полоса «Цель дня» вынесена из шапки в контент
 * (DailyGoalBar ниже): из-за неё шапка главной была на 36 px выше прочих и
 * «прыгала» при переходе между вкладками.
 */
export default async function StudentDashboardHeader({
  userId,
  levelTitle,
  xp,
  streak,
  energy,
  energyMax,
}: {
  userId: string;
  levelTitle: string;
  xp: number;
  streak: number;
  energy: number | null; // null — безлимит (ученик репетитора / Pro)
  energyMax: number;
}) {
  const [notifications, unreadCount] = await Promise.all([
    getNotificationsForUser(userId),
    getUnreadNotificationCount(userId),
  ]);
  // Серия 0 — нейтральная, а не красная: ноль не ошибка, а приглашение начать.
  const streakCls = streak > 0 ? "bg-amber-light text-amber-dark" : "bg-white text-ink-soft border border-line";

  return (
    <MobileAppBar
      left={
        <a href="/student/profile" className="flex min-w-0 items-center gap-2" aria-label={`Профиль · ${levelTitle}`}>
          <span className="shrink-0">
            <Mascot mood="idle" size={36} float={false} />
          </span>
          <span className="hidden truncate font-display text-[15px] font-black text-pine-dark min-[400px]:inline">
            {levelTitle}
          </span>
        </a>
      }
      right={
        <>
          <span
            aria-label={`Серия: ${streak} дн.`}
            className={`flex h-9 items-center gap-1 rounded-pill px-2.5 text-[14px] font-black ${streakCls}`}
          >
            <IconFlame className="h-4 w-4" />
            {streak}
          </span>
          <span
            aria-label={`Опыт: ${xp}`}
            className="flex h-9 items-center gap-1 rounded-pill bg-pine-light px-2.5 text-[14px] font-black text-pine-dark"
          >
            <IconBolt className="h-4 w-4" />
            {xp}
          </span>
          {energy !== null && (
            <a
              href="/student/upgrade"
              aria-label={Number.isFinite(energy) ? `Энергия: ${energy} из ${energyMax}` : "Энергия без ограничений"}
              className="flex h-9 items-center gap-1 rounded-pill bg-teal-light px-2.5 text-[14px] font-black text-teal-text"
            >
              <IconBattery className="h-4 w-4" />
              {Number.isFinite(energy) ? energy : <span className="text-[17px] leading-none">∞</span>}
            </a>
          )}
          <a
            href="/student/subjects"
            aria-label="Все предметы"
            className="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft transition hover:text-pine"
          >
            <IconGrid className="h-5 w-5" />
          </a>
          <NotificationBell initialNotifications={notifications} initialUnread={unreadCount} />
        </>
      }
    />
  );
}

/** Цель дня — первая строка контента главной (раньше была частью шапки). */
export function DailyGoalBar({ done, total, streak = 1 }: { done: number; total: number; streak?: number }) {
  const pct = Math.min(100, Math.round((done / Math.max(1, total)) * 100));
  const closed = done >= total;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line-soft bg-white px-4 py-3">
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
        style={{ background: `conic-gradient(#159A5E 0 ${pct}%, #DCEEE3 ${pct}% 100%)` }}
        aria-hidden
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[12px] font-black text-ink">
          {done}/{total}
        </span>
      </div>
      <div className="min-w-0">
        <p className="text-[15px] font-black text-ink">
          {closed ? "Цель дня выполнена!" : `Цель дня: ещё ${total - done}`}
        </p>
        <p className="text-[12px] text-ink-soft">{closed
            ? "Серия продлена — можно отдыхать"
            : streak > 0
              ? "Решай задачи, чтобы не прервать серию"
              : "Реши задачу сегодня — и начнётся серия 🔥"}</p>
      </div>
    </div>
  );
}
