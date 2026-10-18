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
import MobileAppBar, { AppBarTitle } from "./MobileAppBar";

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
  back,
  children,
}: {
  active: "subjects" | "path" | "review" | "homework" | "mock" | "mistakes" | "profile";
  title: string;
  /** Для страниц второго уровня (программа, проверки, тариф…): стрелка «назад»
   * в мобильной шапке вместо маскота и ссылка «← Назад» над контентом на
   * компьютере. Без неё с таких страниц можно было уйти только через таб-бар. */
  back?: { href: string; label?: string; wide?: boolean };
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
      <MobileAppBar
        left={
          back ? (
            <>
              <a
                href={back.href}
                aria-label={back.label ?? "Назад"}
                className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl font-black text-ink-soft transition hover:text-pine"
              >
                ←
              </a>
              <span className="truncate font-display text-[17px] font-black text-ink">{title}</span>
            </>
          ) : (
            <AppBarTitle href="/student" title={title} mascot={<Mascot mood="idle" size={34} float={false} />} />
          )
        }
        right={<NotificationBell initialNotifications={notifications} initialUnread={unreadCount} />}
      />

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
        standalone={standalone}
      />

      <div className="pb-24 lg:ml-[236px] lg:pb-8">
        {back && (
          // Ширина как у колонки контента страницы (max-w-2xl, у «Программы» — 3xl).
          <div className="hidden px-8 pt-5 lg:block">
            <div className={`mx-auto ${back.wide ? "max-w-3xl" : "max-w-2xl"}`}>
              <a href={back.href} className="text-sm font-bold text-ink-soft transition hover:text-pine">
                ← {back.label ?? "Назад"}
              </a>
            </div>
          </div>
        )}
        {children}
      </div>

      <BottomTabBar
        reviewCount={dueReviewCount}
        mistakesCount={unresolvedMistakesCount}
        homeworkLabel={homeworkLabel}
        standalone={standalone}
      />
    </div>
  );
}
