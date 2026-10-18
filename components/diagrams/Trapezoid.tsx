import { D, givenStyle, unknownStyle, isUnknown, angleArcPath, VertexLabel, num, halo, segLabelPos } from "./shared";

function Lbl({ x, y, value }: { x: number; y: number; value: string }) {
  return (
    <text x={x} y={y} textAnchor="middle" style={{ ...(isUnknown(value) ? unknownStyle : givenStyle), ...halo }}>
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
  labelA = "A",
  labelB = "B",
  labelC = "C",
  labelD = "D",
  angleLabel2,
  leg,
  midSegmentLabel,
}: {
  top?: string;
  bottom?: string;
  height?: string;
  midline?: string;
  rightAngle?: boolean;
  angleLabel?: string;
  showDiagonals?: boolean;
  showMidSegment?: boolean;
  labelA?: string; // нижний левый
  labelB?: string; // нижний правый
  labelC?: string; // верхний правый
  labelD?: string; // верхний левый
  /** Угол при вершине D (верхней левой) — соседний с углом A по боковой стороне. */
  angleLabel2?: string;
  /** Подпись правой боковой стороны BC. */
  leg?: string;
  /** Подпись отрезка через точку пересечения диагоналей (showMidSegment). */
  midSegmentLabel?: string;
}) {
  // Если оба основания — числа, верхнее рисуется в том же отношении к
  // нижнему (не меньше 1/4), иначе отношение 1:3 выглядело бы как 1:1,8.
  const nTop = num(top);
  const nBottom = num(bottom);
  const topW = nTop && nBottom ? 180 * Math.min(0.85, Math.max(0.25, nTop / nBottom)) : rightAngle ? 140 : 100;
  const TL = rightAngle ? { x: 60, y: 50 } : { x: 150 - topW / 2, y: 50 };
  const TR = rightAngle ? { x: 60 + topW, y: 50 } : { x: 150 + topW / 2, y: 50 };
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
        <text
          x={rightAngle ? TL.x - 10 : TL.x + 8}
          y={midline ? 130 : 105}
          textAnchor={rightAngle ? "end" : "start"}
          style={{ ...(isUnknown(height) ? unknownStyle : givenStyle), ...halo }}
        >
          {height}
        </text>
      )}

      {midline && (
        <>
          <line x1={(TL.x + BL.x) / 2} y1={100} x2={(TR.x + BR.x) / 2} y2={100} stroke={D.pine} strokeWidth="2" strokeDasharray="5 4" />
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

      {angleLabel2 && (
        <>
          <path d={angleArcPath(TL.x, TL.y, TR.x, TR.y, BL.x, BL.y, 20)} fill="none" stroke={D.inkSoft} strokeWidth="1.5" />
          <text x={TL.x + 20} y={TL.y + 30} style={{ ...(isUnknown(angleLabel2) ? unknownStyle : givenStyle), ...halo }}>
            {angleLabel2}
          </text>
        </>
      )}

      {leg &&
        (() => {
          const p = segLabelPos(TR, BR, { x: 150, y: 100 }, 12);
          return (
            <text x={p.x} y={p.y} textAnchor="start" style={{ ...(isUnknown(leg) ? unknownStyle : givenStyle), ...halo }}>
              {leg}
            </text>
          );
        })()}

      {showDiagonals && (
        <>
          <line x1={TL.x} y1={TL.y} x2={BR.x} y2={BR.y} stroke={D.pine} strokeWidth="2" strokeDasharray="5 4" />
          <line x1={TR.x} y1={TR.y} x2={BL.x} y2={BL.y} stroke={D.pine} strokeWidth="2" strokeDasharray="5 4" />
          <circle cx={X.x} cy={X.y} r="3" fill={D.pine} />
          {!showMidSegment && (
            <VertexLabel x={X.x} y={X.y} dy={18}>
              O
            </VertexLabel>
          )}
        </>
      )}

      {showMidSegment &&
        (() => {
          const tLeft = (X.y - TL.y) / (BL.y - TL.y);
          const xLeft = TL.x + tLeft * (BL.x - TL.x);
          const tRight = (X.y - TR.y) / (BR.y - TR.y);
          const xRight = TR.x + tRight * (BR.x - TR.x);
          return (
            <>
              <line x1={xLeft} y1={X.y} x2={xRight} y2={X.y} stroke={D.amber} strokeWidth="2.5" />
              {midSegmentLabel && (
                <text
                  x={(xLeft + X.x) / 2}
                  y={X.y - 6}
                  textAnchor="middle"
                  style={{ ...(isUnknown(midSegmentLabel) ? unknownStyle : givenStyle), ...halo }}
                >
                  {midSegmentLabel}
                </text>
              )}
            </>
          );
        })()}

      <Lbl x={(TL.x + TR.x) / 2} y={TL.y - 10} value={top} />
      <Lbl x={(BL.x + BR.x) / 2} y={BL.y + 22} value={bottom} />
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
