import { getSessionUser } from "@/lib/auth";
import { getNotificationsForUser, getUnreadNotificationCount } from "@/lib/queries";
import { logoutAction } from "@/app/actions";
import NotificationBell from "./NotificationBell";
import Mascot from "./Mascot";

export default async function ParentShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const user = (await getSessionUser())!;
  const [notifications, unreadCount] = await Promise.all([
    getNotificationsForUser(user.id),
    getUnreadNotificationCount(user.id),
  ]);

  return (
    <div className="min-h-screen bg-paper">
      <header className="flex items-center justify-between border-b border-line-soft bg-paper px-[18px] pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] lg:hidden">
        <a href="/parent" className="flex items-center gap-2.5">
          <Mascot mood="idle" size={32} float={false} />
          <span className="font-display text-[16px] font-black text-ink">{title}</span>
        </a>
        <div className="flex items-center gap-2">
          <NotificationBell initialNotifications={notifications} initialUnread={unreadCount} />
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-full border-2 border-line px-2.5 py-1.5 text-[11px] font-extrabold uppercase text-ink-soft transition hover:border-coral hover:text-coral"
            >
              Выйти
            </button>
          </form>
        </div>
      </header>

      {/* У родителя всего один раздел (дети) — полноценный сайдбар был бы
          избыточен, вместо него простая закреплённая шапка и на десктопе. */}
      <header className="hidden items-center justify-between border-b border-line-soft bg-white px-8 py-4 lg:flex">
        <a href="/parent" className="flex items-center gap-3">
          <Mascot mood="happy" size={40} float={false} />
          <div>
            <p className="font-display text-base font-black leading-tight text-ink">Планиметрика</p>
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Кабинет родителя</p>
          </div>
        </a>
        <div className="flex items-center gap-3">
          <NotificationBell initialNotifications={notifications} initialUnread={unreadCount} />
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-full border-2 border-line px-3 py-1.5 text-xs font-extrabold uppercase text-ink-soft transition hover:border-coral hover:text-coral"
            >
              Выйти
            </button>
          </form>
        </div>
      </header>

      <div className="pb-8">{children}</div>
    </div>
  );
}
