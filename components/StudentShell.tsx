import { getSessionUser } from "@/lib/auth";
import {
  getNotificationsForUser,
  getUnreadNotificationCount,
  getDueReviewCount,
  getHomeworksForStudent,
  homeworkStatus,
  getMistakesForStudent,
  isStandaloneStudent,
  isEffectivelyPro,
  getEffectiveEnergy,
  FREE_MAX_ENERGY,
} from "@/lib/queries";
import StudentSidebar from "./StudentSidebar";
import BottomTabBar from "./BottomTabBar";
import NotificationBell from "./NotificationBell";
import Mascot from "./Mascot";

/**
 * Общая обёртка для всех "навигационных" экранов ученика (не для экрана
 * самой задачи — там своя, специально упрощённая шапка без сайдбара/таб-бара,
 * см. components/LessonFlow.tsx). Сама получает все данные для сайдбара и
 * таб-бара — страницы просто оборачивают в это свой контент, не повторяя
 * один и тот же набор запросов на каждой странице.
 */
export default async function StudentShell({
  active,
  title,
  children,
}: {
  active: "subjects" | "path" | "review" | "homework" | "mistakes" | "profile";
  title: string;
  children: React.ReactNode;
}) {
  const user = (await getSessionUser())!;
  // Та же логика, что и на дашборде — все запросы независимы друг от
  // друга, распараллеливаем вместо последовательного await.
  const [notifications, unreadCount, dueReviewCount, allHw, mistakes] = await Promise.all([
    getNotificationsForUser(user.id),
    getUnreadNotificationCount(user.id),
    getDueReviewCount(user.id),
    getHomeworksForStudent(user.id),
    getMistakesForStudent(user.id),
  ]);
  const hwStatuses = await Promise.all(allHw.map((h) => homeworkStatus(h, user.id)));
  const pendingHwCount = allHw.filter((_, i) => !hwStatuses[i].complete).length;
  const unresolvedMistakesCount = mistakes.filter((m) => !m.resolved).length;

  const standalone = isStandaloneStudent(user);
  const energy = standalone ? Math.floor(getEffectiveEnergy(user)) : null;
  const isPro = !standalone || isEffectivelyPro(user);
  const homeworkLabel = standalone ? "Пробники" : "Домашка";

  return (
    <div className="min-h-screen bg-paper">
      <header className="flex items-center justify-between border-b border-line-soft bg-paper px-[18px] pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] lg:hidden">
        <a href="/student/subjects" className="flex items-center gap-2.5">
          <Mascot mood="idle" size={32} float={false} />
          <span className="font-display text-[16px] font-black text-ink">{title}</span>
        </a>
        <NotificationBell initialNotifications={notifications} initialUnread={unreadCount} />
      </header>

      <StudentSidebar
        active={active}
        reviewCount={dueReviewCount}
        homeworkCount={pendingHwCount}
        homeworkLabel={homeworkLabel}
        mistakesCount={unresolvedMistakesCount}
        energy={energy}
        energyMax={FREE_MAX_ENERGY}
        isPro={isPro}
        notifications={notifications}
        unreadCount={unreadCount}
      />

      <div className="pb-24 lg:ml-[236px] lg:pb-8">{children}</div>

      <BottomTabBar
        reviewCount={dueReviewCount}
        mistakesCount={unresolvedMistakesCount}
        homeworkLabel={homeworkLabel}
      />
    </div>
  );
}
