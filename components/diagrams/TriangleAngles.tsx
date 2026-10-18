import { D, givenStyle, unknownStyle, isUnknown, VertexLabel, halo, num, rightAnglePath, Pt } from "./shared";

function AngleLabel({ x, y, value }: { x: number; y: number; value: string }) {
  return (
    <text x={x} y={y} textAnchor="middle" style={{ ...(isUnknown(value) ? unknownStyle : givenStyle), ...halo }}>
      {value}
    </text>
  );
}

/** Точка внутри угла при вершине v (по биссектрисе), на расстоянии,
 * достаточном, чтобы подпись не касалась сторон даже у острого угла. */
function insidePoint(v: Pt, p1: Pt, p2: Pt): Pt {
  const u = (p: Pt) => {
    const l = Math.hypot(p.x - v.x, p.y - v.y);
    return { x: (p.x - v.x) / l, y: (p.y - v.y) / l };
  };
  const a = u(p1);
  const b = u(p2);
  const bis = { x: a.x + b.x, y: a.y + b.y };
  const bl = Math.hypot(bis.x, bis.y) || 1;
  const half = Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y))) / 2;
  const dist = Math.min(52, Math.max(28, 17 / Math.sin(half)));
  return { x: v.x + (bis.x / bl) * dist, y: v.y + (bis.y / bl) * dist + 5 };
}

/**
 * Треугольник с подписями углов: a — при левой вершине, b — при правой,
 * c — при верхней. Если один из углов равен 90°, вершина рисуется
 * прямым углом (с квадратиком), а не «на глаз» острым.
 */
export default function TriangleAngles({
  a = "?",
  b = "?",
  c = "?",
  symmetric = false,
  labelA = "B",
  labelB = "C",
  labelC = "A",
}: {
  a?: string;
  b?: string;
  c?: string;
  symmetric?: boolean;
  labelA?: string;
  labelB?: string;
  labelC?: string;
}) {
  let apex: Pt = symmetric ? { x: 150, y: 28 } : { x: 130, y: 26 };
  let left: Pt = { x: 55, y: 172 };
  let right: Pt = { x: 245, y: 172 };
  const rightAt = num(a) === 90 ? "left" : num(b) === 90 ? "right" : num(c) === 90 ? "apex" : null;
  if (rightAt === "left") {
    apex = { x: 70, y: 30 };
    left = { x: 70, y: 172 };
    right = { x: 250, y: 172 };
  } else if (rightAt === "right") {
    apex = { x: 230, y: 30 };
    left = { x: 50, y: 172 };
    right = { x: 230, y: 172 };
  } else if (rightAt === "apex") {
    apex = { x: 150, y: 77 };
  }

  const pa = insidePoint(left, right, apex);
  const pb = insidePoint(right, left, apex);
  const pc = insidePoint(apex, left, right);

  return (
    <svg viewBox="0 0 300 200" className="h-full w-full">
      <polygon
        points={`${apex.x},${apex.y} ${left.x},${left.y} ${right.x},${right.y}`}
        fill={D.pineLight}
        stroke={D.ink}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {symmetric && (
        <>
          {[
            [apex, left],
            [apex, right],
          ].map(([p, q], i) => {
            const mx = (p.x + q.x) / 2;
            const my = (p.y + q.y) / 2;
            const dx = q.x - p.x;
            const dy = q.y - p.y;
            const l = Math.hypot(dx, dy);
            const nx = (-dy / l) * 5;
            const ny = (dx / l) * 5;
            return <line key={i} x1={mx - nx} y1={my - ny} x2={mx + nx} y2={my + ny} stroke={D.ink} strokeWidth="2" />;
          })}
        </>
      )}
      {rightAt === "left" && <path d={rightAnglePath(left, right, apex, 14)} fill="none" stroke={D.ink} strokeWidth="2" />}
      {rightAt === "right" && <path d={rightAnglePath(right, left, apex, 14)} fill="none" stroke={D.ink} strokeWidth="2" />}
      {rightAt === "apex" && <path d={rightAnglePath(apex, left, right, 14)} fill="none" stroke={D.ink} strokeWidth="2" />}
      <AngleLabel x={pc.x} y={pc.y} value={c} />
      <AngleLabel x={pa.x} y={pa.y} value={a} />
      <AngleLabel x={pb.x} y={pb.y} value={b} />
      {/* Подписи вершин — снаружи фигуры. */}
      <VertexLabel x={apex.x} y={apex.y} dy={-10}>
        {labelC}
      </VertexLabel>
      <VertexLabel x={left.x} y={left.y} dx={-14} dy={14}>
        {labelA}
      </VertexLabel>
      <VertexLabel x={right.x} y={right.y} dx={14} dy={14}>
        {labelB}
      </VertexLabel>
    </svg>
  );
}
