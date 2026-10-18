import { D, givenStyle, unknownStyle, isUnknown, VertexLabel, angleArcPath, num, halo, rightAnglePath } from "./shared";

function Lbl({ x, y, value, anchor = "middle" }: { x: number; y: number; value: string; anchor?: "start" | "middle" | "end" }) {
  return (
    <text x={x} y={y} textAnchor={anchor} style={{ ...(isUnknown(value) ? unknownStyle : givenStyle), ...halo }}>
      {value}
    </text>
  );
}

const O = { x: 150, y: 110 };
const R = 70;

export default function CircleDiagram({
  mode = "radius",
  r,
  central,
  inscribed,
  t1,
  t2,
  half,
  chord,
  d,
  labelA,
  labelB,
  labelC,
  labelP = "P",
  labelT1 = "A",
  labelT2 = "B",
  showRadius = false,
  showOP = false,
  op,
}: {
  mode?: "radius" | "centralInscribed" | "tangent" | "chord";
  r?: string;
  central?: string;
  inscribed?: string;
  t1?: string;
  t2?: string;
  half?: string;
  /** chord: подпись всей хорды AB (под ней). */
  chord?: string;
  d?: string;
  /** Подписи точек: в centralInscribed — концы дуги (A — справа, B — слева) и
   * вершина вписанного угла C; в radius/chord — концы радиуса/хорды. */
  labelA?: string;
  labelB?: string;
  labelC?: string;
  /** tangent: внешняя точка и точки касания. */
  labelP?: string;
  labelT1?: string;
  labelT2?: string;
  /** tangent: радиус в точку касания T1 с прямым углом и подписью r. */
  showRadius?: boolean;
  /** tangent: отрезок от центра до внешней точки (пунктир) с подписью op. */
  showOP?: boolean;
  op?: string;
}) {
  return (
    <svg viewBox="0 0 300 220" className="h-full w-full">
      <circle cx={O.x} cy={O.y} r={R} fill={D.pineLight} stroke={D.ink} strokeWidth="2.5" />

      {mode === "radius" && (
        <>
          <VertexLabel x={O.x} y={O.y} dx={-12} dy={-8}>
            O
          </VertexLabel>
          <line x1={O.x} y1={O.y} x2={O.x + 50} y2={O.y - 49} stroke={D.ink} strokeWidth="2" />
          <circle cx={O.x} cy={O.y} r="3" fill={D.ink} />
          <Lbl x={O.x + 34} y={O.y - 16} value={r ?? "?"} />
          <VertexLabel x={O.x + 50} y={O.y - 49} dx={10} dy={-6}>
            {labelA ?? "A"}
          </VertexLabel>
        </>
      )}

      {mode === "centralInscribed" &&
        (() => {
          // Половина центрального угла — из данных (central, иначе 2·inscribed),
          // по умолчанию 140°. A и B симметричны относительно вертикали,
          // вершина вписанного угла C — внизу окружности (на большей дуге).
          const cNum = num(central ?? "");
          const iNum = num(inscribed ?? "");
          const centralDeg = cNum ?? (iNum !== null ? iNum * 2 : 140);
          const phi = (Math.min(180, Math.max(50, centralDeg)) / 2) * (Math.PI / 180);
          const A = { x: O.x + R * Math.sin(phi), y: O.y - R * Math.cos(phi) };
          const B = { x: O.x - R * Math.sin(phi), y: A.y };
          const C = { x: O.x, y: O.y + R };
          const isDiameter = centralDeg >= 179;
          return (
            <>
              <line x1={O.x} y1={O.y} x2={A.x} y2={A.y} stroke={D.ink} strokeWidth="2" />
              <line x1={O.x} y1={O.y} x2={B.x} y2={B.y} stroke={D.ink} strokeWidth="2" />
              <line x1={C.x} y1={C.y} x2={A.x} y2={A.y} stroke={D.pine} strokeWidth="2" />
              <line x1={C.x} y1={C.y} x2={B.x} y2={B.y} stroke={D.pine} strokeWidth="2" />
              {!isDiameter && (
                <path d={angleArcPath(O.x, O.y, A.x, A.y, B.x, B.y, 16)} fill="none" stroke={D.inkSoft} strokeWidth="1.5" />
              )}
              {isDiameter ? (
                <path d={rightAnglePath(C, A, B, 11)} fill="none" stroke={D.pine} strokeWidth="1.5" />
              ) : (
                <path d={angleArcPath(C.x, C.y, A.x, A.y, B.x, B.y, 18)} fill="none" stroke={D.pine} strokeWidth="1.5" />
              )}
              <circle cx={O.x} cy={O.y} r="3" fill={D.ink} />
              <circle cx={C.x} cy={C.y} r="3" fill={D.pine} />
              {central && <Lbl x={O.x} y={O.y - (isDiameter ? 10 : 24)} value={central} />}
              {inscribed && (
                <text
                  x={C.x}
                  y={C.y - (isDiameter ? 22 : 26)}
                  textAnchor="middle"
                  style={{ ...(isUnknown(inscribed) ? unknownStyle : { ...givenStyle, fill: D.pine }), ...halo }}
                >
                  {inscribed}
                </text>
              )}
              <VertexLabel x={O.x} y={O.y} dy={isDiameter ? 16 : 18}>
                O
              </VertexLabel>
              <VertexLabel x={A.x} y={A.y} dx={12} dy={-4}>
                {labelA ?? "A"}
              </VertexLabel>
              <VertexLabel x={B.x} y={B.y} dx={-12} dy={-4}>
                {labelB ?? "B"}
              </VertexLabel>
              <VertexLabel x={C.x} y={C.y} dy={16}>
                {labelC ?? "C"}
              </VertexLabel>
            </>
          );
        })()}

      {mode === "tangent" &&
        (() => {
          const P = { x: 250, y: 195 };
          const dx = P.x - O.x;
          const dy = P.y - O.y;
          const dist = Math.hypot(dx, dy);
          const theta = Math.atan2(dy, dx);
          const alpha = Math.acos(R / dist);
          const T1 = { x: O.x + R * Math.cos(theta + alpha), y: O.y + R * Math.sin(theta + alpha) };
          const T2 = { x: O.x + R * Math.cos(theta - alpha), y: O.y + R * Math.sin(theta - alpha) };
          const mid1 = { x: (P.x + T1.x) / 2, y: (P.y + T1.y) / 2 };
          const mid2 = { x: (P.x + T2.x) / 2, y: (P.y + T2.y) / 2 };
          return (
            <>
              <VertexLabel x={O.x} y={O.y} dx={-12} dy={-8}>
                O
              </VertexLabel>
              <line x1={P.x} y1={P.y} x2={T1.x} y2={T1.y} stroke={D.ink} strokeWidth="2" />
              <line x1={P.x} y1={P.y} x2={T2.x} y2={T2.y} stroke={D.ink} strokeWidth="2" />
              {showOP && <line x1={O.x} y1={O.y} x2={P.x} y2={P.y} stroke={D.inkSoft} strokeWidth="1.5" strokeDasharray="5 4" />}
              {showRadius && (
                <>
                  <line x1={O.x} y1={O.y} x2={T1.x} y2={T1.y} stroke={D.ink} strokeWidth="2" />
                  <path d={rightAnglePath(T1, O, P, 9)} fill="none" stroke={D.ink} strokeWidth="1.5" />
                  {r && <Lbl x={(O.x + T1.x) / 2 - 12} y={(O.y + T1.y) / 2 + 2} value={r} anchor="end" />}
                </>
              )}
              {(showOP || showRadius) && <circle cx={O.x} cy={O.y} r="3" fill={D.ink} />}
              <circle cx={P.x} cy={P.y} r="3" fill={D.ink} />
              <circle cx={T1.x} cy={T1.y} r="2.5" fill={D.ink} />
              <circle cx={T2.x} cy={T2.y} r="2.5" fill={D.ink} />
              {t1 && <Lbl x={mid1.x + 4} y={mid1.y + 22} value={t1} />}
              {t2 && <Lbl x={mid2.x + 14} y={mid2.y - 4} value={t2} anchor="start" />}
              {showOP && op && <Lbl x={(O.x + P.x) / 2 - 8} y={(O.y + P.y) / 2 + 20} value={op} />}
              <VertexLabel x={P.x} y={P.y} dx={10} dy={12}>
                {labelP}
              </VertexLabel>
              <VertexLabel x={T1.x} y={T1.y} dx={-8} dy={16}>
                {labelT1}
              </VertexLabel>
              <VertexLabel x={T2.x} y={T2.y} dx={12} dy={-4}>
                {labelT2}
              </VertexLabel>
            </>
          );
        })()}

      {mode === "chord" && (
        <>
          <VertexLabel x={O.x} y={O.y} dx={-12} dy={-8}>
            O
          </VertexLabel>
          <line x1={93} y1={150} x2={207} y2={150} stroke={D.pine} strokeWidth="2.5" />
          <line x1={O.x} y1={O.y} x2={O.x} y2={150} stroke={D.ink} strokeWidth="2" strokeDasharray="4 3" />
          <path d={`M ${O.x} ${150 - 9} h 9 v 9`} fill="none" stroke={D.ink} strokeWidth="1.2" />
          <line x1={O.x} y1={O.y} x2={207} y2={150} stroke={D.ink} strokeWidth="2" />
          <circle cx={O.x} cy={O.y} r="3" fill={D.ink} />
          {d && <Lbl x={O.x - 8} y={135} value={d} anchor="end" />}
          {r && <Lbl x={188} y={122} value={r} />}
          {half && (
            <text x={178} y={168} textAnchor="middle" style={{ ...(isUnknown(half) ? unknownStyle : { ...givenStyle, fill: D.pine }), ...halo }}>
              {half}
            </text>
          )}
          {chord && !half && (
            <text x={O.x} y={168} textAnchor="middle" style={{ ...(isUnknown(chord) ? unknownStyle : { ...givenStyle, fill: D.pine }), ...halo }}>
              {chord}
            </text>
          )}
          <VertexLabel x={93} y={150} dx={-10} dy={14}>
            {labelA ?? "A"}
          </VertexLabel>
          <VertexLabel x={207} y={150} dx={10} dy={14}>
            {labelB ?? "B"}
          </VertexLabel>
        </>
      )}
    </svg>
  );
}
