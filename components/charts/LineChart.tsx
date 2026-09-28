"use client";

import { useState } from "react";
import { CHART, useWidth, labelStep, Tooltip } from "./chartKit";

export interface LinePoint {
  /** позиция по X в долях 0..1 (вызывающий сам решает: по времени или по неделям) */
  x: number;
  /** null — разрыв линии (например, неделя без занятий) */
  y: number | null;
  axisLabel: string; // подпись под осью
  tooltipLabel: string; // вторая строка подсказки (дата / неделя)
  detail?: string; // третья строка (комментарий)
}

const M = { top: 18, right: 44, bottom: 26, left: 34 };

/**
 * Линейный график одной серии: линия 2px, точки r=4 с белым кольцом,
 * подпись значения только у последней точки, необязательная линия цели.
 * Наведение/фокус: вертикальная линия-прицел прилипает к ближайшей точке,
 * подсказка со значением. Стрелки ←/→ на клавиатуре двигают выбор.
 */
export default function LineChart({
  points,
  yMin,
  yMax,
  yTicks,
  valueSuffix = "",
  reference,
  height = 190,
  ariaLabel,
}: {
  points: LinePoint[];
  yMin: number;
  yMax: number;
  yTicks: number[];
  valueSuffix?: string;
  reference?: { value: number; label: string };
  height?: number;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const plotW = Math.max(0, width - M.left - M.right);
  const plotH = height - M.top - M.bottom;
  const px = (x: number) => M.left + x * plotW;
  const py = (y: number) => M.top + plotH - ((y - yMin) / (yMax - yMin)) * plotH;

  // Разбиваем на непрерывные отрезки по null.
  const segments: { x: number; y: number }[][] = [];
  let cur: { x: number; y: number }[] = [];
  for (const p of points) {
    if (p.y === null) {
      if (cur.length) segments.push(cur);
      cur = [];
    } else cur.push({ x: px(p.x), y: py(p.y) });
  }
  if (cur.length) segments.push(cur);

  const withValue = points.map((p, i) => ({ ...p, i })).filter((p) => p.y !== null);
  const last = withValue[withValue.length - 1];
  const step = labelStep(points.length, plotW);

  const nearest = (clientX: number, rect: DOMRect) => {
    const x = clientX - rect.left;
    let best: number | null = null;
    let bestD = Infinity;
    for (const p of withValue) {
      const d = Math.abs(px(p.x) - x);
      if (d < bestD) {
        bestD = d;
        best = p.i;
      }
    }
    return best;
  };

  const moveActive = (dir: 1 | -1) => {
    if (!withValue.length) return;
    const idx = withValue.findIndex((p) => p.i === active);
    const nextIdx = idx === -1 ? (dir === 1 ? 0 : withValue.length - 1) : Math.min(withValue.length - 1, Math.max(0, idx + dir));
    setActive(withValue[nextIdx].i);
  };

  const a = active !== null ? points[active] : null;

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
          onPointerMove={(e) => setActive(nearest(e.clientX, e.currentTarget.getBoundingClientRect()))}
          onPointerLeave={() => setActive(null)}
          onFocus={() => last && setActive(last.i)}
          onBlur={() => setActive(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") { e.preventDefault(); moveActive(1); }
            if (e.key === "ArrowLeft") { e.preventDefault(); moveActive(-1); }
          }}
        >
          {/* сетка + подписи оси Y */}
          {yTicks.map((t) => (
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

          {/* подписи оси X (с прореживанием) */}
          {points.map((p, i) =>
            i % step === 0 || i === points.length - 1 ? (
              <text
                key={i}
                x={px(p.x)}
                y={height - 8}
                textAnchor="middle"
                fontSize={10}
                fill={CHART.axisText}
              >
                {p.axisLabel}
              </text>
            ) : null
          )}

          {/* линия цели — это порог, поэтому пунктир уместен */}
          {reference && reference.value >= yMin && reference.value <= yMax && (
            <g>
              <line
                x1={M.left}
                x2={M.left + plotW}
                y1={py(reference.value)}
                y2={py(reference.value)}
                stroke={CHART.reference}
                strokeWidth={1.25}
                strokeDasharray="4 4"
              />
              <text
                x={M.left + plotW + 6}
                y={py(reference.value)}
                dominantBaseline="middle"
                fontSize={10}
                fontWeight={700}
                fill={CHART.axisText}
              >
                {reference.label}
              </text>
            </g>
          )}

          {/* прицел */}
          {a && a.y !== null && (
            <line x1={px(a.x)} x2={px(a.x)} y1={M.top} y2={M.top + plotH} stroke={CHART.crosshair} strokeWidth={1} />
          )}

          {/* линия серии */}
          {segments.map((seg, si) =>
            seg.length > 1 ? (
              <polyline
                key={si}
                points={seg.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke={CHART.series}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null
          )}

          {/* точки: r=4 + белое кольцо 2px */}
          {withValue.map((p) => (
            <circle
              key={p.i}
              cx={px(p.x)}
              cy={py(p.y as number)}
              r={active === p.i ? 5.5 : 4}
              fill={CHART.series}
              stroke={CHART.surface}
              strokeWidth={2}
            />
          ))}

          {/* подпись только у последней точки */}
          {last && (
            <text
              x={px(last.x) + 8}
              y={py(last.y as number) - 8}
              fontSize={11}
              fontWeight={700}
              fill="#132A20"
            >
              {last.y}
              {valueSuffix}
            </text>
          )}
        </svg>
      )}

      {a && a.y !== null && (
        <Tooltip
          left={px(a.x)}
          top={py(a.y)}
          value={`${a.y}${valueSuffix}`}
          label={a.tooltipLabel}
          detail={a.detail}
          containerWidth={width}
        />
      )}
    </div>
  );
}
