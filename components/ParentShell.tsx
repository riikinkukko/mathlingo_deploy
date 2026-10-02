import { getSessionUser } from "@/lib/auth";
import { getNotificationsForUser, getUnreadNotificationCount } from "@/lib/queries";
import { logoutAction } from "@/app/actions";
import NotificationBell from "./NotificationBell";
import Mascot from "./Mascot";
import MobileAppBar, { AppBarTitle } from "./MobileAppBar";

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
      <MobileAppBar
        left={<AppBarTitle href="/parent" title={title} mascot={<Mascot mood="idle" size={34} float={false} />} />}
        right={<NotificationBell initialNotifications={notifications} initialUnread={unreadCount} />}
      />

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
      {/* На телефоне «Выйти» — внизу страницы, а не в шапке рядом с колокольчиком. */}
      <form action={logoutAction} className="pb-[max(2rem,var(--app-sab))] text-center lg:hidden">
        <button type="submit" className="min-h-[44px] px-4 text-sm font-bold text-ink-soft underline hover:text-coral">
          Выйти из аккаунта
        </button>
      </form>
    </div>
  );
}
