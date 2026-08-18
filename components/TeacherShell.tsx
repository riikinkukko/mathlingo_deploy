import { getSessionUser } from "@/lib/auth";
import {
  getNotificationsForUser,
  getUnreadNotificationCount,
  getPendingReviewsForTeacher,
} from "@/lib/queries";
import TeacherSidebar from "./TeacherSidebar";
import NotificationBell from "./NotificationBell";
import Mascot from "./Mascot";
import { IconUser as IconStudents, IconBook as IconContent, IconCrown } from "./icons";

export default async function TeacherShell({
  active,
  title,
  children,
}: {
  active: "students" | "content";
  title: string;
  children: React.ReactNode;
}) {
  const user = (await getSessionUser())!;
  const [notifications, unreadCount, pendingReviews] = await Promise.all([
    getNotificationsForUser(user.id),
    getUnreadNotificationCount(user.id),
    getPendingReviewsForTeacher(user.id),
  ]);
  const pendingReviewCount = pendingReviews.length;
  const isAdmin = !!user.isAdmin;

  return (
    <div className="min-h-screen bg-paper">
      <header className="flex items-center justify-between border-b border-line-soft bg-paper px-[18px] py-3 lg:hidden">
        <a href="/teacher" className="flex items-center gap-2.5">
          <Mascot mood="idle" size={32} float={false} />
          <span className="font-display text-[16px] font-black text-ink">{title}</span>
        </a>
        <NotificationBell initialNotifications={notifications} initialUnread={unreadCount} />
      </header>

      <TeacherSidebar
        active={active}
        pendingReviewCount={pendingReviewCount}
        isAdmin={isAdmin}
        notifications={notifications}
        unreadCount={unreadCount}
      />

      <div className="pb-20 lg:ml-[236px] lg:pb-8">{children}</div>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line-soft bg-white pb-[max(10px,env(safe-area-inset-bottom))] pt-2 lg:hidden"
        aria-label="Основная навигация"
      >
        <a
          href="/teacher"
          className="relative flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 px-0.5"
        >
          <span className="relative">
            <IconStudents className={`h-[22px] w-[22px] ${active === "students" ? "text-pine" : "text-line"}`} />
            {pendingReviewCount > 0 && (
              <span className="absolute -right-2 -top-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-pill bg-violet px-1 text-[9px] font-black text-white">
                {pendingReviewCount}
              </span>
            )}
          </span>
          <span className={`text-[10px] leading-none ${active === "students" ? "font-black text-pine-dark" : "font-bold text-ink-soft"}`}>
            Ученики
          </span>
        </a>
        <a
          href="/teacher/content"
          className="relative flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 px-0.5"
        >
          <IconContent className={`h-[22px] w-[22px] ${active === "content" ? "text-pine" : "text-line"}`} />
          <span className={`text-[10px] leading-none ${active === "content" ? "font-black text-pine-dark" : "font-bold text-ink-soft"}`}>
            Контент
          </span>
        </a>
        {isAdmin && (
          <a
            href="/admin"
            className="relative flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 px-0.5"
          >
            <IconCrown className="h-[22px] w-[22px] text-violet" />
            <span className="text-[10px] font-bold leading-none text-violet">Admin</span>
          </a>
        )}
      </nav>
    </div>
  );
}
