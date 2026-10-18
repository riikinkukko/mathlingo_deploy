import { D, givenStyle, unknownStyle, isUnknown, angleArcPath, VertexLabel, fitPoints, num, halo, segLabelPos, Pt } from "./shared";

function Lbl({ x, y, value, anchor = "middle" }: { x: number; y: number; value: string; anchor?: "start" | "middle" | "end" }) {
  return (
    <text x={x} y={y} textAnchor={anchor} style={{ ...(isUnknown(value) ? unknownStyle : givenStyle), ...halo }}>
      {value}
    </text>
  );
}

// Форма по умолчанию (как была всегда): AB = 140px, AD ≈ 117px, ∠A ≈ 59°.
const DEFAULT = {
  TL: { x: 110, y: 50 },
  TR: { x: 250, y: 50 },
  BR: { x: 190, y: 150 },
  BL: { x: 50, y: 150 },
};

interface Bisector {
  from: "A" | "B" | "C" | "D";
  toSide: "AB" | "BC" | "CD" | "DA";
  /** Доля от первой к второй вершине стороны (0..1), где стоит отмеченная
   * точка. Используется, только если настоящая биссектриса не попадает на
   * эту сторону при данной форме (иначе точка считается честно). */
  t: number;
  label: string;
  /** Подписи двух частей стороны: от первой вершины стороны до точки и от точки до второй. */
  seg1?: string;
  seg2?: string;
}

/**
 * Параллелограмм ABCD (A — нижняя левая, B — нижняя правая, C — верхняя
 * правая, D — верхняя левая вершина).
 * Форма: по умолчанию фиксированная; ab/ad (числа) и angle (°) задают
 * пропорции; equalSides — ромб (равные стороны, перпендикулярные
 * диагонали; если d1 и d2 — числа, угол ромба следует их отношению).
 */
export default function Parallelogram({
  a,
  b,
  h,
  angleLabel,
  angleLabel2,
  showDiagonals = false,
  d1,
  d2,
  d1Half,
  equalSides = false,
  labelA = "A",
  labelB = "B",
  labelC = "C",
  labelD = "D",
  bisector,
  ab,
  ad,
  angle,
}: {
  a?: string; // нижняя сторона AB
  b?: string; // левая сторона AD
  h?: string;
  angleLabel?: string; // угол A
  angleLabel2?: string; // соседний угол B
  showDiagonals?: boolean;
  d1?: string; // диагональ DB (из верхнего левого в нижний правый)
  d2?: string; // диагональ AC
  d1Half?: string; // половина диагонали DB: отрезок OB
  equalSides?: boolean;
  labelA?: string; // нижний левый
  labelB?: string; // нижний правый
  labelC?: string; // верхний правый
  labelD?: string; // верхний левый
  bisector?: Bisector;
  ab?: number;
  ad?: number;
  angle?: number;
}) {
  let BL: Pt, BR: Pt, TR: Pt, TL: Pt;
  const customShape = equalSides || (ab && ad) || angle;
  if (!customShape) {
    ({ BL, BR, TR, TL } = DEFAULT);
  } else {
    let sAB = ab ?? 1.2;
    let sAD = ad ?? 1;
    let alpha = angle ?? 60;
    if (equalSides) {
      sAB = 1;
      sAD = 1;
      const n1 = num(d1 ?? "");
      const n2 = num(d2 ?? "");
      // d1 = DB, d2 = AC; DB/AC = tg(α/2)
      alpha = n1 && n2 ? (2 * Math.atan(n1 / n2) * 180) / Math.PI : angle ?? 60;
      alpha = Math.min(80, Math.max(40, alpha));
    }
    const ar = (alpha * Math.PI) / 180;
    const raw = [
      { x: 0, y: 0 },
      { x: sAB, y: 0 },
      { x: sAB + sAD * Math.cos(ar), y: -sAD * Math.sin(ar) },
      { x: sAD * Math.cos(ar), y: -sAD * Math.sin(ar) },
    ];
    const { map } = fitPoints(raw, { x0: 45, y0: 40, x1: 255, y1: 152 });
    [BL, BR, TR, TL] = raw.map(map);
  }
  const O = { x: (BL.x + TR.x) / 2, y: (BL.y + TR.y) / 2 };

  const vertexPoint = { A: BL, B: BR, C: TR, D: TL };
  const sideEnds: Record<Bisector["toSide"], [Pt, Pt]> = {
    AB: [BL, BR],
    BC: [BR, TR],
    CD: [TR, TL],
    DA: [TL, BL],
  };

  /** Точка, где биссектриса угла при вершине v пересекает отрезок p1–p2 (параметр t), или null. */
  function trueBisectorT(v: Pt, n1: Pt, n2: Pt, p1: Pt, p2: Pt): number | null {
    const u = (p: Pt) => {
      const l = Math.hypot(p.x - v.x, p.y - v.y);
      return { x: (p.x - v.x) / l, y: (p.y - v.y) / l };
    };
    const e1 = u(n1);
    const e2 = u(n2);
    const dir = { x: e1.x + e2.x, y: e1.y + e2.y };
    const sx = p2.x - p1.x;
    const sy = p2.y - p1.y;
    const den = dir.x * sy - dir.y * sx;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((p1.x - v.x) * dir.y - (p1.y - v.y) * dir.x) / den;
    return t >= -1e-6 && t <= 1 + 1e-6 ? t : null;
  }

  const neighbours: Record<Bisector["from"], [Pt, Pt]> = {
    A: [BR, TL],
    B: [BL, TR],
    C: [BR, TL],
    D: [TR, BL],
  };

  return (
    <svg viewBox="0 0 300 200" className="h-full w-full">
      <polygon
        points={`${TL.x},${TL.y} ${TR.x},${TR.y} ${BR.x},${BR.y} ${BL.x},${BL.y}`}
        fill={D.pineLight}
        stroke={D.ink}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />

      {h && (
        <>
          <line x1={TL.x} y1={TL.y} x2={TL.x} y2={BL.y} stroke={D.ink} strokeWidth="2" strokeDasharray="5 4" />
          <path d={`M ${TL.x - 12} ${BL.y} v -12 h 12`} fill="none" stroke={D.ink} strokeWidth="1.5" />
          <text x={TL.x + 8} y={(TL.y + BL.y) / 2 + 5} style={{ ...(isUnknown(h) ? unknownStyle : givenStyle), ...halo }}>
            {h}
          </text>
        </>
      )}

      {angleLabel && (
        <>
          <path d={angleArcPath(BL.x, BL.y, BR.x, BR.y, TL.x, TL.y, 24)} fill="none" stroke={D.inkSoft} strokeWidth="1.5" />
          {(() => {
            const u = (p: Pt) => {
              const l = Math.hypot(p.x - BL.x, p.y - BL.y);
              return { x: (p.x - BL.x) / l, y: (p.y - BL.y) / l };
            };
            const e1 = u(BR);
            const e2 = u(TL);
            const half = Math.acos(e1.x * e2.x + e1.y * e2.y) / 2;
            const dist = Math.min(56, Math.max(34, 16 / Math.sin(half)));
            const bl = Math.hypot(e1.x + e2.x, e1.y + e2.y);
            return (
              <text
                x={BL.x + ((e1.x + e2.x) / bl) * dist}
                y={BL.y + ((e1.y + e2.y) / bl) * dist + 5}
                textAnchor="middle"
                style={{ ...(isUnknown(angleLabel) ? unknownStyle : givenStyle), ...halo }}
              >
                {angleLabel}
              </text>
            );
          })()}
        </>
      )}
      {angleLabel2 && (
        <>
          <path d={angleArcPath(BR.x, BR.y, TR.x, TR.y, BL.x, BL.y, 20)} fill="none" stroke={D.inkSoft} strokeWidth="1.5" />
          <text
            x={BR.x - 22}
            y={BR.y - 26}
            textAnchor="end"
            style={{ ...(isUnknown(angleLabel2) ? unknownStyle : givenStyle), ...halo }}
          >
            {angleLabel2}
          </text>
        </>
      )}

      {showDiagonals && (
        <>
          <line x1={TL.x} y1={TL.y} x2={BR.x} y2={BR.y} stroke={D.pine} strokeWidth="2" strokeDasharray="5 4" />
          <line x1={TR.x} y1={TR.y} x2={BL.x} y2={BL.y} stroke={D.pine} strokeWidth="2" strokeDasharray="5 4" />
          {equalSides && (
            <path
              d={(() => {
                const u = (p: Pt) => {
                  const l = Math.hypot(p.x - O.x, p.y - O.y);
                  return { x: (p.x - O.x) / l, y: (p.y - O.y) / l };
                };
                const e1 = u(TR);
                const e2 = u(BR);
                const s = 9;
                return `M ${O.x + e1.x * s} ${O.y + e1.y * s} L ${O.x + (e1.x + e2.x) * s} ${O.y + (e1.y + e2.y) * s} L ${O.x + e2.x * s} ${O.y + e2.y * s}`;
              })()}
              fill="none"
              stroke={D.ink}
              strokeWidth="1.3"
            />
          )}
          <circle cx={O.x} cy={O.y} r="2.5" fill={D.pine} />
          {/* d1 — у нижнего правого конца своей диагонали, d2 — у верхнего правого:
              подписи не сходятся у точки пересечения и не сливаются в «10 12». */}
          {d1 && <Lbl x={TL.x + (BR.x - TL.x) * 0.74 + 10} y={TL.y + (BR.y - TL.y) * 0.74 - 4} value={d1} anchor="start" />}
          {d2 && <Lbl x={TR.x + (BL.x - TR.x) * 0.24 - 4} y={TR.y + (BL.y - TR.y) * 0.24 - 9} value={d2} anchor="end" />}
          {d1Half && <Lbl x={O.x + (BR.x - O.x) * 0.5 + 12} y={O.y + (BR.y - O.y) * 0.5 + 2} value={d1Half} anchor="start" />}
        </>
      )}

      {equalSides &&
        [
          [TL, TR],
          [TR, BR],
          [BR, BL],
          [BL, TL],
        ].map(([p1, p2], i) => {
          const mx = (p1.x + p2.x) / 2;
          const my = (p1.y + p2.y) / 2;
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const len = Math.hypot(dx, dy);
          const nx = (-dy / len) * 5;
          const ny = (dx / len) * 5;
          return <line key={i} x1={mx - nx} y1={my - ny} x2={mx + nx} y2={my + ny} stroke={D.ink} strokeWidth="1.5" />;
        })}

      {bisector &&
        (() => {
          const from = vertexPoint[bisector.from];
          const [p1, p2] = sideEnds[bisector.toSide];
          const [n1, n2] = neighbours[bisector.from];
          const t = trueBisectorT(from, n1, n2, p1, p2) ?? bisector.t;
          const point = { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t };
          const outward = (q1: Pt, q2: Pt, off: number) => {
            const mx = (q1.x + q2.x) / 2;
            const my = (q1.y + q2.y) / 2;
            const dx = q2.x - q1.x;
            const dy = q2.y - q1.y;
            const l = Math.hypot(dx, dy) || 1;
            let nx = -dy / l;
            let ny = dx / l;
            if ((mx - O.x) * nx + (my - O.y) * ny < 0) {
              nx = -nx;
              ny = -ny;
            }
            return { x: mx + nx * off, y: my + ny * off + 5 };
          };
          const s1 = bisector.seg1 ? outward(p1, point, 14) : null;
          const s2 = bisector.seg2 ? outward(point, p2, 14) : null;
          const lx = point.x + (point.x >= O.x ? -9 : 9);
          return (
            <>
              <line x1={from.x} y1={from.y} x2={point.x} y2={point.y} stroke={D.amber} strokeWidth="2.5" />
              <path d={angleArcPath(from.x, from.y, n1.x, n1.y, point.x, point.y, 20)} fill="none" stroke={D.amber} strokeWidth="1.3" />
              <path d={angleArcPath(from.x, from.y, point.x, point.y, n2.x, n2.y, 24)} fill="none" stroke={D.amber} strokeWidth="1.3" />
              <circle cx={point.x} cy={point.y} r="3" fill={D.amber} />
              <text
                x={lx}
                y={point.y + (point.y < O.y ? -6 : 16)}
                textAnchor={point.x >= O.x ? "end" : "start"}
                fontSize="13"
                fontWeight="800"
                fontStyle="italic"
                fill={D.ink}
                style={halo}
              >
                {bisector.label}
              </text>
              {s1 && <Lbl x={s1.x + (s1.x >= O.x ? 4 : -4)} y={s1.y} value={bisector.seg1!} anchor={s1.x >= O.x ? "start" : "end"} />}
              {s2 && <Lbl x={s2.x + (s2.x >= O.x ? 4 : -4)} y={s2.y} value={bisector.seg2!} anchor={s2.x >= O.x ? "start" : "end"} />}
            </>
          );
        })()}

      {a && <Lbl x={(BR.x + BL.x) / 2} y={BL.y + 22} value={a} />}
      {b &&
        (() => {
          const q = segLabelPos(BL, TL, O, 13);
          return <Lbl x={q.x} y={q.y} value={b} />;
        })()}
      <VertexLabel x={BL.x} y={BL.y} dx={-10} dy={14}>
        {labelA}
      </VertexLabel>
      <VertexLabel x={BR.x} y={BR.y} dx={10} dy={14}>
        {labelB}
      </VertexLabel>
      <VertexLabel x={TR.x} y={TR.y} dx={10} dy={-8}>
        {labelC}
      </VertexLabel>
      <VertexLabel x={TL.x} y={TL.y} dx={-10} dy={-8}>
        {labelD}
      </VertexLabel>
    </svg>
  );
}
