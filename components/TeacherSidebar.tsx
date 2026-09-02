import Mascot from "./Mascot";
import NotificationBell from "./NotificationBell";
import { logoutAction } from "@/app/actions";
import { IconUser as IconStudents, IconBook as IconContent, IconCrown, IconStar } from "./icons";
import { Notification } from "@/lib/types";

export default function TeacherSidebar({
  active,
  pendingReviewCount,
  isAdmin,
  notifications,
  unreadCount,
}: {
  active: "students" | "content" | "upgrade";
  pendingReviewCount: number;
  isAdmin: boolean;
  notifications: Notification[];
  unreadCount: number;
}) {
  const items = [
    { key: "students", label: "Мои ученики", href: "/teacher", icon: IconStudents, badge: pendingReviewCount },
    { key: "content", label: "Контент программы", href: "/teacher/content", icon: IconContent, badge: 0 },
    { key: "upgrade", label: "Тариф", href: "/teacher/upgrade", icon: IconStar, badge: 0 },
  ] as const;

  return (
    <aside className="fixed inset-y-0 left-0 hidden w-[236px] flex-col bg-pine-dark px-4 py-5 lg:flex">
      <div className="mb-6 flex items-center justify-between px-1">
        <a href="/teacher" className="flex items-center gap-2.5">
          <Mascot mood="happy" size={36} float={false} />
          <div>
            <p className="font-display text-[15px] font-black leading-tight text-white">Планиметрика</p>
            <p className="text-[10px] font-bold uppercase tracking-wide text-white/50">Кабинет репетитора</p>
          </div>
        </a>
        <NotificationBell initialNotifications={notifications} initialUnread={unreadCount} variant="dark" />
      </div>

      <nav className="flex flex-col gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === active;
          return (
            <a
              key={item.key}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13.5px] font-bold transition ${
                isActive ? "bg-white text-pine-dark" : "text-white/80 hover:bg-white/10"
              }`}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              <span className="flex-1 truncate">{item.label}</span>
              {item.badge > 0 && (
                <span
                  className={`rounded-pill px-1.5 py-0.5 text-[10px] font-black ${
                    isActive ? "bg-violet text-white" : "bg-white/15 text-white"
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </a>
          );
        })}
        {isAdmin && (
          <a
            href="/admin"
            className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13.5px] font-bold text-violet transition hover:bg-white/10"
          >
            <IconCrown className="h-[18px] w-[18px] shrink-0" />
            <span className="flex-1 truncate">Admin</span>
          </a>
        )}
      </nav>

      {/* У учителя нет отдельной страницы профиля (в отличие от ученика) —
          выход остаётся прямо в сайдбаре, а не прячется на несуществующий
          экран. */}
      <div className="mt-auto pt-4">
        <form action={logoutAction}>
          <button
            type="submit"
            className="w-full rounded-xl px-3 py-2.5 text-left text-[13.5px] font-bold text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            Выйти
          </button>
        </form>
      </div>
    </aside>
  );
}
