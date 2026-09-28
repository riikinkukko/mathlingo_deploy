"use client";

import { useState } from "react";
import { CHART, useWidth, labelStep, Tooltip } from "./chartKit";

export interface Column {
  value: number;
  axisLabel: string;
  tooltipLabel: string;
}

// Поля совпадают с LineChart — чтобы недели на соседних графиках стояли друг под другом.
const M = { top: 18, right: 44, bottom: 26, left: 34 };

/** Скруглённый верх 4px, квадратное основание — столбец «растёт» от базовой линии. */
function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

/** Аккуратный верх шкалы: 0, 5, 10, 20, 50, 100, 200… */
function niceMax(v: number): number {
  if (v <= 5) return 5;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= v) return m * pow;
  return 10 * pow;
}

/**
 * Столбчатый график одной серии (например, задач по неделям). Столбец не
 * толще 24px, подписи значений — только у максимума и у текущей недели.
 * Наведение/фокус на столбце — подсказка; зона наведения шире столбца.
 */
export default function ColumnChart({
  columns,
  unit,
  height = 180,
  ariaLabel,
}: {
  columns: Column[];
  unit: (n: number) => string;
  height?: number;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const max = niceMax(Math.max(1, ...columns.map((c) => c.value)));
  const ticks = [0, max / 2, max];
  const plotW = Math.max(0, width - M.left - M.right);
  const plotH = height - M.top - M.bottom;
  const band = columns.length ? plotW / columns.length : 0;
  const barW = Math.min(24, band * 0.6);
  const py = (v: number) => M.top + plotH - (v / max) * plotH;
  const step = labelStep(columns.length, plotW);

  const maxIdx = columns.reduce((best, c, i) => (c.value > columns[best].value ? i : best), 0);
  const lastIdx = columns.length - 1;
  const labelled = new Set([maxIdx, lastIdx].filter((i) => columns[i]?.value > 0));

  const a = active !== null ? columns[active] : null;

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          tabIndex={0}
          className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-pine/40"
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive(lastIdx)}
          onBlur={() => setActive(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") { e.preventDefault(); setActive((i) => Math.min(lastIdx, (i ?? -1) + 1)); }
            if (e.key === "ArrowLeft") { e.preventDefault(); setActive((i) => Math.max(0, (i ?? lastIdx + 1) - 1)); }
          }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={M.left + plotW} y1={py(t)} y2={py(t)} stroke={CHART.grid} strokeWidth={1} />
              <text
                x={M.left - 6}
                y={py(t)}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={10}
                fill={CHART.axisText}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {t}
              </text>
            </g>
          ))}

          {columns.map((c, i) => {
            const cx = M.left + band * i + band / 2;
            const h = (c.value / max) * plotH;
            return (
              <g key={i}>
                {c.value > 0 && (
                  <path
                    d={barPath(cx - barW / 2, py(c.value), barW, h)}
                    fill={active === i ? CHART.seriesHover : CHART.series}
                  />
                )}
                {labelled.has(i) && (
                  <text
                    x={cx}
                    y={py(c.value) - 5}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={700}
                    fill="#132A20"
                  >
                    {c.value}
                  </text>
                )}
                {(i % step === 0 || i === lastIdx) && (
                  <text x={cx} y={height - 8} textAnchor="middle" fontSize={10} fill={CHART.axisText}>
                    {c.axisLabel}
                  </text>
                )}
                {/* зона наведения — вся полоса недели, а не только столбец */}
                <rect
                  x={M.left + band * i}
                  y={M.top}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  onPointerEnter={() => setActive(i)}
                  onPointerMove={() => setActive(i)}
                />
              </g>
            );
          })}
        </svg>
      )}

      {a && (
        <Tooltip
          left={M.left + band * (active as number) + band / 2}
          top={py(a.value)}
          value={unit(a.value)}
          label={a.tooltipLabel}
          containerWidth={width}
        />
      )}
    </div>
  );
}
