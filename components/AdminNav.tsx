"use client";

import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Пользователи", match: (p: string) => p === "/admin" || p.startsWith("/admin/user") },
  { href: "/admin/metrics", label: "Метрики", match: (p: string) => p.startsWith("/admin/metrics") },
  { href: "/admin/payments", label: "Платежи", match: (p: string) => p.startsWith("/admin/payments") },
  { href: "/admin/promo", label: "Промокоды", match: (p: string) => p.startsWith("/admin/promo") },
];

/**
 * Общая шапка админки: дорога обратно в кабинет репетитора и вкладки разделов.
 * Раньше на /admin кнопка «Метрики» была залита зелёным и выглядела активной,
 * а вернуться в кабинет можно было только кнопкой браузера «Назад».
 */
export default function AdminNav() {
  const pathname = usePathname() ?? "/admin";
  return (
    <div className="border-b border-line bg-white pt-[max(0.75rem,var(--app-sat))]">
      <div className="mx-auto flex max-w-4xl flex-wrap px-4 items-center justify-between gap-x-4 gap-y-2">
        <a href="/teacher" className="text-[13px] font-bold text-ink-soft hover:text-pine-dark hover:underline">
          ← Кабинет репетитора
        </a>
        <span className="text-[11px] font-extrabold uppercase tracking-widest text-violet">Admin</span>
      </div>
      <nav aria-label="Разделы админки" className="mx-auto -mb-px mt-2 flex max-w-4xl gap-1 overflow-x-auto px-1">
        {TABS.map((t) => {
          const active = t.match(pathname);
          return (
            <a
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-[14px] transition ${
                active ? "border-pine-dark font-black text-ink" : "border-transparent font-bold text-ink-soft hover:text-ink"
              }`}
            >
              {t.label}
            </a>
          );
        })}
      </nav>
    </div>
  );
}
