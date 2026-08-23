"use client";

import { useState, ReactNode } from "react";

/**
 * Показывает первые `limit` элементов, остальные — по клику "Показать
 * ещё N". Принимает уже ОТРЕНДЕРЕННЫЕ элементы (`items: ReactNode[]`),
 * а не render-prop функцию — функции нельзя передавать из серверного
 * родителя в клиентский компонент через границу RSC (React бросает
 * "Functions cannot be passed directly to Client Components"), а
 * готовый JSX передавать можно, это стандартный паттерн "children as
 * slots".
 */
export default function RecentList({
  items,
  limit = 4,
  emptyText,
}: {
  items: ReactNode[];
  limit?: number;
  emptyText: string;
}) {
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) {
    return <p className="text-sm text-ink-soft">{emptyText}</p>;
  }

  const visible = expanded ? items : items.slice(0, limit);
  const hiddenCount = items.length - visible.length;

  return (
    <div className="space-y-2">
      {visible}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full rounded-xl border border-dashed border-line py-2.5 text-sm font-bold text-ink-soft transition hover:border-pine hover:text-pine"
        >
          Показать ещё {hiddenCount} →
        </button>
      )}
      {expanded && items.length > limit && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="w-full rounded-xl py-2 text-xs font-bold text-ink-soft transition hover:text-pine"
        >
          Свернуть
        </button>
      )}
    </div>
  );
}
