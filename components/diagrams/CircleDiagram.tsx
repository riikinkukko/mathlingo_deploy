import { D, givenStyle, unknownStyle, isUnknown } from "./shared";

function Lbl({ x, y, value }: { x: number; y: number; value: string }) {
  return (
    <text x={x} y={y} textAnchor="middle" style={isUnknown(value) ? unknownStyle : givenStyle}>
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
  d,
}: {
  mode?: "radius" | "centralInscribed" | "tangent" | "chord";
  r?: string;
  central?: string;
  inscribed?: string;
  t1?: string;
  t2?: string;
  half?: string;
  d?: string;
}) {
  return (
    <svg viewBox="0 0 300 220" className="h-full w-full">
      <circle cx={O.x} cy={O.y} r={R} fill={D.pineLight} stroke={D.ink} strokeWidth="2.5" />

      {mode === "radius" && (
        <>
          <line x1={O.x} y1={O.y} x2={O.x + 50} y2={O.y - 49} stroke={D.ink} strokeWidth="2" />
          <circle cx={O.x} cy={O.y} r="3" fill={D.ink} />
          <Lbl x={O.x + 34} y={O.y - 16} value={r ?? "?"} />
        </>
      )}

      {mode === "centralInscribed" && (
        <>
          <line x1={O.x} y1={O.y} x2={215.8} y2={86.1} stroke={D.ink} strokeWidth="2" />
          <line x1={O.x} y1={O.y} x2={84.2} y2={86.1} stroke={D.ink} strokeWidth="2" />
          <line x1={150} y1={180} x2={215.8} y2={86.1} stroke={D.pine} strokeWidth="2" />
          <line x1={150} y1={180} x2={84.2} y2={86.1} stroke={D.pine} strokeWidth="2" />
          <circle cx={O.x} cy={O.y} r="3" fill={D.ink} />
          <circle cx={150} cy={180} r="3" fill={D.pine} />
          {central && <Lbl x={150} y={92} value={central} />}
          {inscribed && (
            <text x={150} y={168} textAnchor="middle" style={isUnknown(inscribed) ? unknownStyle : { ...givenStyle, fill: D.pine }}>
              {inscribed}
            </text>
          )}
        </>
      )}

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
              <line x1={P.x} y1={P.y} x2={T1.x} y2={T1.y} stroke={D.ink} strokeWidth="2" />
              <line x1={P.x} y1={P.y} x2={T2.x} y2={T2.y} stroke={D.ink} strokeWidth="2" />
              <circle cx={P.x} cy={P.y} r="3" fill={D.ink} />
              <circle cx={T1.x} cy={T1.y} r="2.5" fill={D.ink} />
              <circle cx={T2.x} cy={T2.y} r="2.5" fill={D.ink} />
              {t1 && <Lbl x={mid1.x + 16} y={mid1.y + 4} value={t1} />}
              {t2 && <Lbl x={mid2.x - 4} y={mid2.y - 12} value={t2} />}
            </>
          );
        })()}

      {mode === "chord" && (
        <>
          <line x1={93} y1={150} x2={207} y2={150} stroke={D.pine} strokeWidth="2.5" />
          <line x1={O.x} y1={O.y} x2={O.x} y2={150} stroke={D.ink} strokeWidth="2" strokeDasharray="4 3" />
          <line x1={O.x} y1={O.y} x2={207} y2={150} stroke={D.ink} strokeWidth="2" />
          <circle cx={O.x} cy={O.y} r="3" fill={D.ink} />
          {d && <Lbl x={O.x + 16} y={132} value={d} />}
          {r && <Lbl x={188} y={122} value={r} />}
          {half && (
            <text x={172} y={166} textAnchor="middle" style={isUnknown(half) ? unknownStyle : { ...givenStyle, fill: D.pine }}>
              {half}
            </text>
          )}
        </>
      )}
    </svg>
  );
}
