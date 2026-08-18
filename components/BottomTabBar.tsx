"use client";

import { usePathname } from "next/navigation";
import { IconMap, IconRepeat, IconClipboard, IconUser } from "./icons";

export default function BottomTabBar({
  reviewCount = 0,
  homeworkLabel = "Задания",
}: {
  reviewCount?: number;
  homeworkLabel?: string;
}) {
  const pathname = usePathname();

  const tabs = [
    { href: "/student", label: "Путь", icon: IconMap, match: (p: string) => p === "/student" || p.startsWith("/student/skill") },
    { href: "/student/review", label: "Повтор", icon: IconRepeat, match: (p: string) => p.startsWith("/student/review"), badge: reviewCount },
    { href: "/student/homework", label: homeworkLabel, icon: IconClipboard, match: (p: string) => p.startsWith("/student/homework") },
    { href: "/student/profile", label: "Профиль", icon: IconUser, match: (p: string) => p.startsWith("/student/profile") || p.startsWith("/student/achievements") },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line-soft bg-white pb-[max(16px,env(safe-area-inset-bottom))] pt-2 lg:hidden"
      aria-label="Основная навигация"
    >
      {tabs.map((tab) => {
        const active = tab.match(pathname);
        const Icon = tab.icon;
        return (
          <a
            key={tab.href}
            href={tab.href}
            className="relative flex min-h-[44px] flex-1 flex-col items-center justify-center gap-1 px-1"
          >
            <span className="relative">
              <Icon className={`h-6 w-6 ${active ? "text-pine" : "text-line"}`} />
              {!!tab.badge && tab.badge > 0 && (
                <span className="absolute -right-2.5 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-pill bg-violet px-1 text-[10px] font-black text-white">
                  {tab.badge}
                </span>
              )}
            </span>
            <span
              className={`text-[11px] ${
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
