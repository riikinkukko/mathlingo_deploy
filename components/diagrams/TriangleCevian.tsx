import { D, givenStyle, unknownStyle, isUnknown, angleArcPath, VertexLabel, halo, rightAnglePath, Pt } from "./shared";

function Lbl({ x, y, value, anchor = "middle", fontSize }: { x: number; y: number; value: string; anchor?: "start" | "middle" | "end"; fontSize?: number }) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      style={{ ...(isUnknown(value) ? unknownStyle : givenStyle), ...halo, ...(fontSize ? { fontSize } : {}) }}
    >
      {value}
    </text>
  );
}

const LEFT = { x: 50, y: 165 };
const RIGHT = { x: 250, y: 165 };
const APEX_Y = 32;

/** Вершина над основанием LEFT–RIGHT, для которой |P–LEFT| : |P–RIGHT| = k
 * (окружность Аполлония), на высоте APEX_Y, если получится, иначе — в самой
 * высокой точке окружности. Нужна, чтобы биссектриса делила основание в
 * заданном отношении (BD:DC = AB:AC). */
function apexForRatio(k: number): Pt {
  if (Math.abs(k - 1) < 0.02) return { x: (LEFT.x + RIGHT.x) / 2, y: APEX_Y };
  const L = LEFT.x;
  const R = RIGHT.x;
  const c = (L - k * k * R) / (1 - k * k);
  const rad = Math.abs((k * (R - L)) / (1 - k * k));
  const hgt = LEFT.y - APEX_Y;
  const y = hgt <= rad ? APEX_Y : LEFT.y - rad;
  const dy = LEFT.y - y;
  const dx = Math.sqrt(Math.max(rad * rad - dy * dy, 0));
  const x = k < 1 ? c + dx : c - dx;
  return { x, y };
}

export default function TriangleCevian({
  base,
  height,
  variant = "height",
  labelA = "A",
  labelB = "B",
  labelC = "C",
  labelFoot = "D",
  footT,
  isosceles = false,
  leftSeg,
  rightSeg,
  sideLeft,
  sideRight,
  cevianLabel,
  halfLabel,
  angle1,
  angle2,
  midline,
}: {
  base?: string;
  height?: string;
  variant?: "height" | "median" | "bisector" | "midline";
  labelA?: string; // вершина, из которой проведена чевиана
  labelB?: string; // левый конец основания
  labelC?: string; // правый конец основания
  labelFoot?: string; // точка на основании
  /** Положение основания чевианы (доля от левого конца). Для биссектрисы
   * вершина подбирается так, чтобы BD:DC = AB:AC = footT : (1 − footT). */
  footT?: number;
  /** Равнобедренный (вершина над серединой основания). */
  isosceles?: boolean;
  leftSeg?: string; // отрезок от левого конца основания до основания чевианы
  rightSeg?: string; // от основания чевианы до правого конца
  sideLeft?: string; // боковая сторона вершина–левый конец
  sideRight?: string; // вершина–правый конец
  cevianLabel?: string; // подпись на самой чевиане (медиана/биссектриса)
  halfLabel?: string; // биссектриса: величина половины угла (левая часть)
  angle1?: string; // высота: часть угла при вершине слева от высоты
  angle2?: string; // справа от высоты
  midline?: string; // variant="midline": подпись средней линии
}) {
  const left = LEFT;
  const right = RIGHT;
  let apex: Pt = isosceles ? { x: 150, y: APEX_Y } : { x: 140, y: APEX_Y - 2 };
  if (variant === "bisector" && footT !== undefined && !isosceles) {
    apex = apexForRatio(footT / (1 - footT));
  }

  let foot: Pt;
  if (variant === "median") {
    foot = { x: (left.x + right.x) / 2, y: left.y };
  } else if (variant === "bisector") {
    // Честная биссектриса: BD:DC = |AB| : |AC|.
    const lb = Math.hypot(apex.x - left.x, apex.y - left.y);
    const lc = Math.hypot(apex.x - right.x, apex.y - right.y);
    const t = lb / (lb + lc);
    foot = { x: left.x + (right.x - left.x) * t, y: left.y };
  } else if (variant === "height") {
    foot = { x: apex.x, y: left.y };
  } else {
    foot = { x: left.x + (right.x - left.x) * (footT ?? 0.5), y: left.y };
  }

  const midL = { x: (apex.x + left.x) / 2, y: (apex.y + left.y) / 2 };
  const midR = { x: (apex.x + right.x) / 2, y: (apex.y + right.y) / 2 };
  const showFoot = variant !== "midline";

  const tick = (p: Pt, q: Pt, key: string) => {
    const mx = (p.x + q.x) / 2;
    const my = (p.y + q.y) / 2;
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const l = Math.hypot(dx, dy) || 1;
    const nx = (-dy / l) * 4;
    const ny = (dx / l) * 4;
    return <line key={key} x1={mx - nx} y1={my - ny} x2={mx + nx} y2={my + ny} stroke={D.ink} strokeWidth="2" />;
  };

  return (
    <svg viewBox="0 0 300 220" className="h-full w-full">
      <polygon
        points={`${apex.x},${apex.y} ${left.x},${left.y} ${right.x},${right.y}`}
        fill={D.pineLight}
        stroke={D.ink}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {showFoot && (
        <line
          x1={apex.x}
          y1={apex.y}
          x2={foot.x}
          y2={foot.y}
          stroke={D.ink}
          strokeWidth="2"
          strokeDasharray={variant === "height" ? "5 4" : undefined}
        />
      )}
      {variant === "height" && <path d={rightAnglePath(foot, apex, right, 12)} fill="none" stroke={D.ink} strokeWidth="1.5" />}
      {variant === "median" && (
        <>
          {tick(left, foot, "t1")}
          {tick(foot, right, "t2")}
        </>
      )}
      {variant === "bisector" && (
        <>
          <path d={angleArcPath(apex.x, apex.y, left.x, left.y, foot.x, foot.y, 24)} fill="none" stroke={D.pine} strokeWidth="1.5" />
          <path d={angleArcPath(apex.x, apex.y, foot.x, foot.y, right.x, right.y, 28)} fill="none" stroke={D.pine} strokeWidth="1.5" />
        </>
      )}
      {variant === "midline" && (
        <>
          <line x1={midL.x} y1={midL.y} x2={midR.x} y2={midR.y} stroke={D.amber} strokeWidth="2.5" />
          {tick(apex, midL, "m1")}
          {tick(midL, left, "m2")}
          {tick(apex, midR, "m3")}
          {tick(midR, right, "m4")}
          <circle cx={midL.x} cy={midL.y} r="2.5" fill={D.amber} />
          <circle cx={midR.x} cy={midR.y} r="2.5" fill={D.amber} />
          {midline && <Lbl x={(midL.x + midR.x) / 2} y={midL.y - 7} value={midline} />}
        </>
      )}

      {variant === "height" && height && <Lbl x={foot.x + 8} y={(apex.y + foot.y) / 2 + 22} value={height} anchor="start" />}
      {variant === "height" && angle1 && <Lbl x={apex.x - 6} y={apex.y + 40} value={angle1} anchor="end" fontSize={13} />}
      {variant === "height" && angle2 && <Lbl x={apex.x + 6} y={apex.y + 40} value={angle2} anchor="start" fontSize={13} />}
      {variant === "bisector" && halfLabel && (
        <Lbl
          x={apex.x + (foot.x - apex.x) * 0.32 - 8}
          y={apex.y + (foot.y - apex.y) * 0.32 + 4}
          value={halfLabel}
          anchor="end"
          fontSize={13}
        />
      )}
      {cevianLabel && showFoot && (
        <Lbl x={(apex.x + foot.x) / 2 + 7} y={(apex.y + foot.y) / 2 + 18} value={cevianLabel} anchor="start" />
      )}
      {sideLeft && <Lbl x={midL.x - 10} y={midL.y + 2} value={sideLeft} anchor="end" />}
      {sideRight && <Lbl x={midR.x + 10} y={midR.y + 2} value={sideRight} anchor="start" />}
      {leftSeg && <Lbl x={(left.x + foot.x) / 2} y={left.y + 20} value={leftSeg} />}
      {rightSeg && <Lbl x={(foot.x + right.x) / 2} y={left.y + 20} value={rightSeg} />}
      {base && <Lbl x={150} y={leftSeg || rightSeg ? 212 : 200} value={base} />}
      <VertexLabel x={apex.x} y={apex.y} dy={-10}>
        {labelA}
      </VertexLabel>
      <VertexLabel x={left.x} y={left.y} dx={-14} dy={14}>
        {labelB}
      </VertexLabel>
      <VertexLabel x={right.x} y={right.y} dx={14} dy={14}>
        {labelC}
      </VertexLabel>
      {showFoot && (
        <VertexLabel x={foot.x} y={foot.y} dy={16}>
          {labelFoot}
        </VertexLabel>
      )}
    </svg>
  );
}
