"use client";

import { useMemo } from "react";
import Mascot from "./Mascot";
import { IconCheck, IconLock } from "./icons";

export interface PathSkillItem {
  id: string;
  title: string;
  state: "done" | "current" | "locked";
  problemsCount: number;
  factsCount: number;
  solvedCount: number;
}

const COLOR_HEX = ["#1CAE6B", "#16B3A6", "#8B6BE0", "#F0A93C", "#F0555A"];
const COLOR_CLASS = ["bg-pine", "bg-teal", "bg-violet", "bg-amber", "bg-coral"];

const AMPLITUDE = 82;
const STEP_Y = 108;
const TOP_PAD = 60;
const BOTTOM_PAD = 50;

function xOffset(i: number) {
  // Плавная синусоида — не идеальный зигзаг, а органичная "тропинка".
  return Math.sin(i * 0.95) * AMPLITUDE;
}

/** Сглаженная кривая через все точки тропинки (кубические Безье между
 * соседними узлами, с касательными по направлению соседей — без резких
 * изломов на поворотах). */
function buildSmoothPath(points: { x: number; y: number }[]) {
  if (points.length < 2) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
  }
  return d;
}

export default function SkillPath({
  skills,
  colorIndex = 0,
}: {
  skills: PathSkillItem[];
  colorIndex?: number;
}) {
  const centerX = 160;
  const color = COLOR_HEX[colorIndex % COLOR_HEX.length];
  const colorClass = COLOR_CLASS[colorIndex % COLOR_CLASS.length];

  const points = useMemo(
    () => skills.map((_, i) => ({ x: centerX + xOffset(i), y: TOP_PAD + i * STEP_Y })),
    [skills.length]
  );
  const height = TOP_PAD + Math.max(0, skills.length - 1) * STEP_Y + BOTTOM_PAD;
  const pathD = buildSmoothPath(points);
  const currentIdx = skills.findIndex((s) => s.state === "current");

  return (
    <div className="relative mx-auto" style={{ width: 320, height }}>
      <svg viewBox={`0 0 320 ${height}`} width={320} height={height} className="absolute inset-0">
        <path d={pathD} fill="none" stroke="#D7EAE0" strokeWidth="10" strokeLinecap="round" />
        {currentIdx > 0 && (
          <path
            d={buildSmoothPath(points.slice(0, currentIdx + 1))}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            opacity="0.55"
          />
        )}
      </svg>

      {skills.map((s, i) => {
        const p = points[i];
        const locked = s.state === "locked";
        const done = s.state === "done";
        const current = s.state === "current";
        const labelSide = xOffset(i) >= 0 ? "left" : "right";

        const node = (
          <div
            className={`relative flex h-16 w-16 items-center justify-center rounded-full text-white shadow-button transition ${
              locked ? "bg-line shadow-none" : colorClass
            } ${current ? "animate-node-pulse" : ""} ${!locked ? "hover:scale-105 active:scale-95" : ""}`}
          >
            {locked ? (
              <IconLock className="h-6 w-6 text-ink-soft/50" />
            ) : done ? (
              <IconCheck className="h-7 w-7 animate-node-check" />
            ) : (
              <span className="font-display text-lg font-black">{i + 1}</span>
            )}
            {current && (
              <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 -translate-y-full">
                <Mascot mood="idle" size={44} float />
              </span>
            )}
          </div>
        );

        return (
          <div
            key={s.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: p.x, top: p.y, width: 64 }}
          >
            {locked ? (
              <div className="flex flex-col items-center">
                {node}
                <p
                  className={`absolute top-1/2 w-32 -translate-y-1/2 text-xs font-bold leading-tight text-ink-soft/60 ${
                    labelSide === "left" ? "right-full mr-3 text-right" : "left-full ml-3 text-left"
                  }`}
                >
                  {s.title}
                </p>
              </div>
            ) : (
              <a href={`/student/skill/${s.id}`} className="flex flex-col items-center">
                {node}
                <p
                  className={`absolute top-1/2 w-32 -translate-y-1/2 text-xs font-bold leading-tight text-ink ${
                    labelSide === "left" ? "right-full mr-3 text-right" : "left-full ml-3 text-left"
                  }`}
                >
                  {s.title}
                  {current && (
                    <span className="mt-0.5 block text-[10px] font-extrabold uppercase tracking-wide text-pine">
                      {s.solvedCount > 0 ? "Продолжить →" : "Начать →"}
                    </span>
                  )}
                </p>
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}
