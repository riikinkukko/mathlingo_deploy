import { User } from "@/lib/types";
import { logoutAction } from "@/app/actions";
import {
  getNotificationsForUser,
  getUnreadNotificationCount,
  isStandaloneStudent,
  isEffectivelyPro,
  getEffectiveEnergy,
  FREE_MAX_ENERGY,
} from "@/lib/queries";
import { IconBolt, IconFlame, IconBattery, IconCrown } from "./icons";
import NotificationBell from "./NotificationBell";
import Mascot from "./Mascot";

export default async function AppHeader({
  user,
  gamification,
  crumbs,
  subTabs,
}: {
  user: User;
  gamification?: { xp: number; streak: number };
  crumbs?: { label: string; href?: string }[];
  subTabs?: { label: string; href: string; active: boolean; icon: React.ReactNode }[];
}) {
  const notifications = await getNotificationsForUser(user.id);
  const unread = await getUnreadNotificationCount(user.id);
  const standalone = isStandaloneStudent(user);
  const isPro = standalone && isEffectivelyPro(user);
  const energy = standalone && !isPro ? Math.floor(getEffectiveEnergy(user)) : null;

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto max-w-3xl px-4 pt-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {user.role === "STUDENT" ? (
              <Mascot mood="wink" size={44} interactive float={false} />
            ) : (
              <a
                href={`/${user.role.toLowerCase()}`}
                className="flex h-10 w-10 items-center justify-center rounded-2xl bg-pine font-display text-lg font-black text-white shadow-button"
              >
                П
              </a>
            )}
            <a href={`/${user.role.toLowerCase()}`} className="leading-tight">
              <span className="block font-display text-lg font-black text-pine-dark">
                Планиметрика
              </span>
              <span className="block text-[11px] font-bold uppercase tracking-wide text-ink-soft">
                ЕГЭ · профиль
              </span>
            </a>
          </div>
          <div className="flex items-center gap-3">
            {gamification && (
              <div className="flex items-center gap-2">
                <Chip color="text-amber" bg="bg-amber-light">
                  <IconBolt className="h-4 w-4" />
                  {gamification.xp}
                </Chip>
                <Chip
                  color="text-coral"
                  bg={gamification.streak >= 7 ? "bg-coral" : "bg-coral-light"}
                  className={gamification.streak >= 7 ? "!text-white" : ""}
                >
                  <IconFlame
                    className={
                      gamification.streak >= 14
                        ? "h-5 w-5 animate-pulse drop-shadow-[0_0_4px_rgba(240,85,90,0.8)]"
                        : gamification.streak >= 7
                          ? "h-5 w-5"
                          : gamification.streak >= 3
                            ? "h-[18px] w-[18px]"
                            : "h-4 w-4"
                    }
                  />
                  {gamification.streak}
                </Chip>
              </div>
            )}
            {isPro && (
              <a href="/student/upgrade">
                <Chip color="text-white" bg="bg-gradient-to-r from-amber to-coral">
                  <IconCrown className="h-4 w-4" />
                  PRO
                </Chip>
              </a>
            )}
            {energy !== null && (
              <a href="/student/upgrade">
                <Chip
                  color={energy === 0 ? "text-coral" : "text-teal"}
                  bg={energy === 0 ? "bg-coral-light" : "bg-teal-light"}
                >
                  <IconBattery className="h-4 w-4" />
                  {energy}/{FREE_MAX_ENERGY}
                </Chip>
              </a>
            )}
            <NotificationBell initialNotifications={notifications} initialUnread={unread} />
            {user.isAdmin && (
              <a
                href="/admin"
                className="rounded-full border-2 border-violet/30 px-2.5 py-1.5 text-xs font-extrabold uppercase text-violet transition hover:bg-violet/10"
              >
                Admin
              </a>
            )}
            <div className="flex items-center gap-2">
              {user.role === "STUDENT" ? (
                <a
                  href="/student/profile"
                  className="text-sm font-bold text-ink hover:text-pine"
                >
                  {user.name.split(" ")[0]}
                </a>
              ) : (
                <span className="hidden text-sm font-bold text-ink sm:inline">
                  {user.name.split(" ")[0]}
                </span>
              )}
              <form action={logoutAction}>
                <button
                  className="rounded-full border-2 border-line px-3 py-1.5 text-xs font-extrabold uppercase text-ink-soft transition hover:border-coral hover:text-coral"
                  type="submit"
                >
                  Выйти
                </button>
              </form>
            </div>
          </div>
        </div>

        {subTabs && (
          <nav className="mb-4 flex gap-2">
            {subTabs.map((t) => (
              <a
                key={t.href}
                href={t.href}
                className={`flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-extrabold transition ${
                  t.active
                    ? "bg-white text-pine shadow-soft"
                    : "bg-pine-light/60 text-ink-soft hover:text-pine-dark"
                }`}
              >
                {t.icon}
                {t.label}
              </a>
            ))}
          </nav>
        )}

        {crumbs && crumbs.length > 0 && (
          <nav className="flex items-center gap-1.5 pb-4 text-sm text-ink-soft">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-line">/</span>}
                {c.href ? (
                  <a href={c.href} className="font-semibold hover:text-pine">
                    {c.label}
                  </a>
                ) : (
                  <span className="font-semibold text-ink">{c.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        {!crumbs && !subTabs && <div className="pb-3" />}
      </div>
    </header>
  );
}

function Chip({
  children,
  color,
  bg,
  className = "",
}: {
  children: React.ReactNode;
  color: string;
  bg: string;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-1 rounded-pill ${bg} ${color} px-2.5 py-1.5 text-sm font-extrabold ${className}`}
    >
      {children}
    </div>
  );
}
