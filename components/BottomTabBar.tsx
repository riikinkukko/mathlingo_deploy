"use client";

import { usePathname } from "next/navigation";
import { IconMap, IconRepeat, IconClipboard, IconBook, IconUser } from "./icons";

export default function BottomTabBar({
  reviewCount = 0,
  mistakesCount = 0,
  homeworkLabel = "Задания",
}: {
  reviewCount?: number;
  mistakesCount?: number;
  homeworkLabel?: string;
}) {
  const pathname = usePathname();

  const tabs = [
    { href: "/student", label: "Путь", icon: IconMap, match: (p: string) => p === "/student" || p.startsWith("/student/skill") },
    { href: "/student/review", label: "Повтор", icon: IconRepeat, match: (p: string) => p.startsWith("/student/review"), badge: reviewCount },
    { href: "/student/homework", label: homeworkLabel, icon: IconClipboard, match: (p: string) => p.startsWith("/student/homework") },
    { href: "/student/mistakes", label: "Ошибки", icon: IconBook, match: (p: string) => p.startsWith("/student/mistakes"), badge: mistakesCount },
    { href: "/student/profile", label: "Профиль", icon: IconUser, match: (p: string) => p.startsWith("/student/profile") || p.startsWith("/student/achievements") },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line-soft bg-white pb-[max(10px,env(safe-area-inset-bottom))] pt-2 lg:hidden"
      aria-label="Основная навигация"
    >
      {tabs.map((tab) => {
        const active = tab.match(pathname);
        const Icon = tab.icon;
        return (
          <a
            key={tab.href}
            href={tab.href}
            className="relative flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 px-0.5"
          >
            <span className="relative">
              <Icon className={`h-[22px] w-[22px] ${active ? "text-pine" : "text-line"}`} />
              {!!tab.badge && tab.badge > 0 && (
                <span className="absolute -right-2 -top-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-pill bg-violet px-1 text-[9px] font-black text-white">
                  {tab.badge}
                </span>
              )}
            </span>
            <span
              className={`text-[10px] leading-none ${
                active ? "font-black text-pine-dark" : "font-bold text-ink-soft"
              }`}
            >
              {tab.label}
            </span>
          </a>
        );
      })}
    </nav>
  );
}
