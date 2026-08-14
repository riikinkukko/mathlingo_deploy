import { D, givenStyle, unknownStyle, isUnknown, angleArcPath } from "./shared";

function Lbl({ x, y, value }: { x: number; y: number; value: string }) {
  return (
    <text x={x} y={y} textAnchor="middle" style={isUnknown(value) ? unknownStyle : givenStyle}>
      {value}
    </text>
  );
}

function lineIntersect(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  p4: { x: number; y: number }
) {
  const d = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
  if (d === 0) return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / d;
  return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
}

export default function Trapezoid({
  top = "?",
  bottom = "?",
  height,
  midline,
  rightAngle = false,
  angleLabel,
  showDiagonals = false,
  showMidSegment = false,
}: {
  top?: string;
  bottom?: string;
  height?: string;
  midline?: string;
  rightAngle?: boolean;
  angleLabel?: string;
  showDiagonals?: boolean;
  showMidSegment?: boolean;
}) {
  const TL = rightAngle ? { x: 60, y: 50 } : { x: 100, y: 50 };
  const TR = { x: 200, y: 50 };
  const BR = { x: 240, y: 150 };
  const BL = { x: 60, y: 150 };

  // Точка пересечения диагоналей TL-BR и TR-BL — считаем честно по формуле
  // пересечения отрезков, а не на глаз.
  const X = lineIntersect(TL, BR, TR, BL);

  return (
    <svg viewBox="0 0 300 200" className="h-full w-full">
      <polygon
        points={`${TL.x},${TL.y} ${TR.x},${TR.y} ${BR.x},${BR.y} ${BL.x},${BL.y}`}
        fill={D.pineLight}
        stroke={D.ink}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />

      {rightAngle && (
        <path d={`M ${BL.x} ${BL.y - 16} h 16 v 16`} fill="none" stroke={D.ink} strokeWidth="2" />
      )}

      {height && !rightAngle && (
        <>
          <line
            x1={TL.x}
            y1={TL.y}
            x2={TL.x}
            y2={BL.y}
            stroke={D.ink}
            strokeWidth="2"
            strokeDasharray="5 4"
          />
          <path d={`M ${TL.x - 12} ${BL.y} v -12 h 12`} fill="none" stroke={D.ink} strokeWidth="1.5" />
        </>
      )}
      {height && (
        <text x={(rightAngle ? TL.x : TL.x) - 20} y={105} style={isUnknown(height) ? unknownStyle : givenStyle}>
          {height}
        </text>
      )}

      {midline && (
        <>
          <line x1={80} y1={100} x2={220} y2={100} stroke={D.pine} strokeWidth="2" strokeDasharray="5 4" />
          <text x={150} y={92} textAnchor="middle" style={isUnknown(midline) ? unknownStyle : givenStyle}>
            {midline}
          </text>
        </>
      )}

      {angleLabel && (
        <>
          <path
            d={angleArcPath(BL.x, BL.y, BR.x, BR.y, TL.x, TL.y, 24)}
            fill="none"
            stroke={D.inkSoft}
            strokeWidth="1.5"
          />
          <text x={BL.x + 34} y={BL.y - 10} style={isUnknown(angleLabel) ? unknownStyle : givenStyle}>
            {angleLabel}
          </text>
        </>
      )}

      {showDiagonals && (
        <>
          <line x1={TL.x} y1={TL.y} x2={BR.x} y2={BR.y} stroke={D.pine} strokeWidth="2" strokeDasharray="5 4" />
          <line x1={TR.x} y1={TR.y} x2={BL.x} y2={BL.y} stroke={D.pine} strokeWidth="2" strokeDasharray="5 4" />
          <circle cx={X.x} cy={X.y} r="3" fill={D.pine} />
        </>
      )}

      {showMidSegment &&
        (() => {
          const tLeft = (X.y - TL.y) / (BL.y - TL.y);
          const xLeft = TL.x + tLeft * (BL.x - TL.x);
          const tRight = (X.y - TR.y) / (BR.y - TR.y);
          const xRight = TR.x + tRight * (BR.x - TR.x);
          return <line x1={xLeft} y1={X.y} x2={xRight} y2={X.y} stroke={D.amber} strokeWidth="2.5" />;
        })()}

      <Lbl x={(TL.x + TR.x) / 2} y={TL.y - 10} value={top} />
      <Lbl x={(BL.x + BR.x) / 2} y={BL.y + 22} value={bottom} />
    </svg>
  );
}
