import { D, VertexLabel, fitPoints, halo, isUnknown, givenStyle, unknownStyle, Pt } from "./shared";

/**
 * Равнобедренный треугольник ABC (AB = AC) с вневписанной окружностью,
 * касающейся основания BC и продолжений боковых сторон за B и C.
 * Геометрия считается честно по длинам ab (= AC) и bc: высота
 * h = √(ab² − (bc/2)²), радиус r = S/(p − bc), центр — на оси симметрии
 * под BC на расстоянии r, точки касания с продолжениями — на расстоянии p
 * (полупериметр) от A. Весь чертёж затем вписывается в viewBox.
 */
export default function TriangleExcircleDiagram({
  labelA = "A",
  labelB = "B",
  labelC = "C",
  showTangentPoints = true,
  ab = 5,
  bc = 6,
  sideLabel,
  baseLabel,
  rLabel,
}: {
  labelA?: string;
  labelB?: string;
  labelC?: string;
  showTangentPoints?: boolean;
  /** Длина боковой стороны AB = AC (число). */
  ab?: number;
  /** Длина основания BC (число). */
  bc?: number;
  sideLabel?: string;
  baseLabel?: string;
  rLabel?: string;
}) {
  const half = bc / 2;
  const hgt = Math.sqrt(Math.max(ab * ab - half * half, 0.01));
  const p = ab + half;
  const S = half * hgt;
  const r = S / (p - bc);

  // Модельные координаты (y вниз): BC на y=0, A сверху.
  const mA = { x: 0, y: -hgt };
  const mB = { x: -half, y: 0 };
  const mC = { x: half, y: 0 };
  const mO = { x: 0, y: r };
  const along = (from: Pt, to: Pt, dist: number) => {
    const l = Math.hypot(to.x - from.x, to.y - from.y);
    return { x: from.x + ((to.x - from.x) / l) * dist, y: from.y + ((to.y - from.y) / l) * dist };
  };
  const mN = along(mA, mB, p);
  const mN2 = along(mA, mC, p);
  const mE = along(mA, mB, p + r * 0.45);
  const mE2 = along(mA, mC, p + r * 0.45);

  const bounds = [mA, mB, mC, mE, mE2, { x: -r, y: 0 }, { x: r, y: 2 * r }, { x: 0, y: 2 * r }];
  const { map, s } = fitPoints(bounds, { x0: 30, y0: 26, x1: 270, y1: 210 });
  const A = map(mA);
  const B = map(mB);
  const C = map(mC);
  const O = map(mO);
  const N = map(mN);
  const N2 = map(mN2);
  const E = map(mE);
  const E2 = map(mE2);
  const M = map({ x: 0, y: 0 });
  const R = r * s;

  const valueStyle = (v: string) => ({ ...(isUnknown(v) ? unknownStyle : givenStyle), ...halo });

  return (
    <svg viewBox="0 0 300 225" className="h-full w-full">
      <polygon points={`${A.x},${A.y} ${B.x},${B.y} ${C.x},${C.y}`} fill={D.pineLight} fillOpacity="0.6" />
      <polygon points={`${A.x},${A.y} ${B.x},${B.y} ${C.x},${C.y}`} fill="none" stroke={D.ink} strokeWidth="2" />

      {/* продолжения сторон AB и AC за B и C — пунктиром, дальше точек касания */}
      <line x1={B.x} y1={B.y} x2={E.x} y2={E.y} stroke={D.inkSoft} strokeWidth="1.5" strokeDasharray="4 3" />
      <line x1={C.x} y1={C.y} x2={E2.x} y2={E2.y} stroke={D.inkSoft} strokeWidth="1.5" strokeDasharray="4 3" />

      {/* вневписанная окружность */}
      <circle cx={O.x} cy={O.y} r={R} fill="none" stroke={D.pine} strokeWidth="2" />
      <circle cx={O.x} cy={O.y} r="2.5" fill={D.inkSoft} />
      <text x={O.x + 6} y={O.y + 14} fontSize="12" fontWeight="700" fontStyle="italic" fill={D.inkSoft}>
        O
      </text>
      {rLabel && (
        <>
          <line x1={O.x} y1={O.y} x2={N2.x} y2={N2.y} stroke={D.ink} strokeWidth="1.5" />
          <text x={(O.x + N2.x) / 2 + 4} y={(O.y + N2.y) / 2 + 16} textAnchor="middle" style={valueStyle(rLabel)}>
            {rLabel}
          </text>
        </>
      )}

      {showTangentPoints && (
        <>
          <circle cx={M.x} cy={M.y} r="2.5" fill={D.ink} />
          <circle cx={N.x} cy={N.y} r="2.5" fill={D.ink} />
          <circle cx={N2.x} cy={N2.y} r="2.5" fill={D.ink} />
        </>
      )}

      {baseLabel && (
        <text x={M.x} y={M.y + 17} textAnchor="middle" style={{ ...valueStyle(baseLabel), fontSize: 13 }}>
          {baseLabel}
        </text>
      )}
      {sideLabel &&
        [B, C].map((P, i) => {
          // наружу от треугольника по нормали к боковой стороне
          const mx = (A.x + P.x) / 2;
          const my = (A.y + P.y) / 2;
          const dx = P.x - A.x;
          const dy = P.y - A.y;
          const l = Math.hypot(dx, dy) || 1;
          let nx = -dy / l;
          let ny = dx / l;
          if (ny > 0) {
            nx = -nx;
            ny = -ny;
          }
          return (
            <text
              key={i}
              x={mx + nx * 12}
              y={my + ny * 12}
              textAnchor={i === 0 ? "end" : "start"}
              style={{ ...valueStyle(sideLabel), fontSize: 13 }}
            >
              {sideLabel}
            </text>
          );
        })}

      <VertexLabel x={A.x} y={A.y} dy={-9}>
        {labelA}
      </VertexLabel>
      <VertexLabel x={B.x} y={B.y} dx={-11} dy={4}>
        {labelB}
      </VertexLabel>
      <VertexLabel x={C.x} y={C.y} dx={11} dy={4}>
        {labelC}
      </VertexLabel>
    </svg>
  );
}
