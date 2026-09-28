"use client";

import { useEffect, useRef, useState } from "react";

// Общие параметры графиков кабинета. Цвета — токены из tailwind.config.ts,
// продублированы здесь, потому что SVG-атрибутам нужны сами значения.
export const CHART = {
  series: "#159A5E", // pine-chart — проверен валидатором палитр на белом фоне
  seriesHover: "#1CAE6B", // pine — «подсвеченный» столбец при наведении
  surface: "#FFFFFF", // фон карточки = фон графика (кольцо вокруг точек)
  grid: "#E4F0E9", // line-soft — на шаг от фона, тонкие сплошные линии
  axisText: "#5C7A6C", // ink-soft
  reference: "#5C7A6C", // линия цели
  crosshair: "#9DB5A9",
} as const;

/** Ширина контейнера в пикселях — чтобы рисовать SVG в реальном размере, без растяжения. */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    setWidth(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** Шаг подписей оси X, чтобы подписи не налезали друг на друга. */
export function labelStep(count: number, plotWidth: number, minGap = 44): number {
  if (count <= 1 || plotWidth <= 0) return 1;
  return Math.max(1, Math.ceil((minGap * count) / plotWidth));
}

export function Tooltip({
  left,
  top,
  value,
  label,
  detail,
  containerWidth,
}: {
  left: number;
  top: number;
  value: string;
  label: string;
  detail?: string;
  containerWidth: number;
}) {
  // Не выходим за края карточки: у правого края разворачиваем подсказку влево.
  const flip = left > containerWidth - 150;
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 min-w-[120px] rounded-xl border border-line bg-white px-3 py-2 shadow-soft"
      style={{
        left: flip ? undefined : left + 12,
        right: flip ? containerWidth - left + 12 : undefined,
        top: Math.max(0, top - 18),
      }}
    >
      <div className="flex items-center gap-2">
        <span className="inline-block h-[2px] w-3 rounded" style={{ background: CHART.series }} />
        <span className="text-sm font-bold text-ink">{value}</span>
      </div>
      <p className="mt-0.5 text-[11px] text-ink-soft">{label}</p>
      {detail && <p className="text-[11px] text-ink-soft">{detail}</p>}
    </div>
  );
}

/** Табличный вид графика: те же значения без наведения (доступность, печать). */
export function ChartTable({
  caption,
  rows,
  columns,
}: {
  caption: string;
  columns: [string, string];
  rows: { label: string; value: string }[];
}) {
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs font-bold text-ink-soft hover:text-ink">
        Показать таблицей
      </summary>
      <table className="mt-2 w-full text-left text-xs">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line text-ink-soft">
            <th className="py-1 font-semibold">{columns[0]}</th>
            <th className="py-1 text-right font-semibold">{columns[1]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-line-soft last:border-0">
              <td className="py-1 text-ink">{r.label}</td>
              <td className="py-1 text-right font-mono text-ink" style={{ fontVariantNumeric: "tabular-nums" }}>
                {r.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
