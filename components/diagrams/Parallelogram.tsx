import { D, givenStyle, unknownStyle, isUnknown, angleArcPath, VertexLabel } from "./shared";

function Lbl({ x, y, value }: { x: number; y: number; value: string }) {
  return (
    <text x={x} y={y} textAnchor="middle" style={isUnknown(value) ? unknownStyle : givenStyle}>
      {value}
    </text>
  );
}

const TL = { x: 110, y: 50 };
const TR = { x: 250, y: 50 };
const BR = { x: 190, y: 150 };
const BL = { x: 50, y: 150 };

export default function Parallelogram({
  a,
  h,
  angleLabel,
  showDiagonals = false,
  d1,
  d2,
  equalSides = false,
  labelA = "A",
  labelB = "B",
  labelC = "C",
  labelD = "D",
}: {
  a?: string;
  h?: string;
  angleLabel?: string;
  showDiagonals?: boolean;
  d1?: string;
  d2?: string;
  equalSides?: boolean;
  labelA?: string; // нижний левый
  labelB?: string; // нижний правый
  labelC?: string; // верхний правый
  labelD?: string; // верхний левый
}) {
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
          <text x={TL.x + 18} y={105} style={isUnknown(h) ? unknownStyle : givenStyle}>
            {h}
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
          <text x={BL.x + 34} y={BL.y - 12} style={isUnknown(angleLabel) ? unknownStyle : givenStyle}>
            {angleLabel}
          </text>
        </>
      )}

      {showDiagonals && (
        <>
          <line x1={TL.x} y1={TL.y} x2={BR.x} y2={BR.y} stroke={D.pine} strokeWidth="2" strokeDasharray="5 4" />
          <line x1={TR.x} y1={TR.y} x2={BL.x} y2={BL.y} stroke={D.pine} strokeWidth="2" strokeDasharray="5 4" />
          {d1 && (
            <text x={(TL.x + BR.x) / 2 + 20} y={(TL.y + BR.y) / 2 - 6} style={isUnknown(d1) ? unknownStyle : givenStyle}>
              {d1}
            </text>
          )}
          {d2 && (
            <text x={(TR.x + BL.x) / 2 - 22} y={(TR.y + BL.y) / 2 - 6} style={isUnknown(d2) ? unknownStyle : givenStyle}>
              {d2}
            </text>
          )}
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
          return (
            <line
              key={i}
              x1={mx - nx}
              y1={my - ny}
              x2={mx + nx}
              y2={my + ny}
              stroke={D.ink}
              strokeWidth="1.5"
            />
          );
        })}

      {a && <Lbl x={(BR.x + BL.x) / 2} y={BL.y + 22} value={a} />}
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
