"use client";

import { useState, ReactNode } from "react";

/**
 * Сворачиваемая секция — общая для кабинетов родителя и учителя, где
 * "Прогресс по навыкам", "Домашка", "Журнал занятий" при большом
 * количестве данных занимали весь экран сразу. Заголовок + краткая
 * сводка (summary) видны ВСЕГДА, даже свёрнуто — так общая динамика
 * остаётся на виду без разворачивания, а детали доступны по клику.
 * Работает одинаково на десктопе и мобильном — просто toggle высоты.
 */
export default function CollapsibleSection({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  /** Краткая сводка справа от заголовка — видна и в свёрнутом, и в
   * развёрнутом виде (например, "29/29 навыков · 100%" или "3 новых"). */
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="mb-8">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 rounded-xl px-1 py-1 text-left transition hover:bg-pine-light/40"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 font-display text-lg font-black text-ink">
          {title}
          <span
            className={`inline-block text-ink-soft transition-transform ${open ? "rotate-90" : ""}`}
            aria-hidden
          >
            ›
          </span>
        </span>
        {summary && <span className="text-sm font-semibold text-ink-soft">{summary}</span>}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </section>
  );
}
