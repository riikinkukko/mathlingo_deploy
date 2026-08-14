import { D, givenStyle, unknownStyle, isUnknown } from "./shared";

function Lbl({ x, y, value }: { x: number; y: number; value: string }) {
  return (
    <text x={x} y={y} textAnchor="middle" style={isUnknown(value) ? unknownStyle : givenStyle}>
      {value}
    </text>
  );
}

export default function TriangleExteriorAngle({
  inner1 = "?",
  inner2,
  exterior = "?",
}: {
  inner1?: string; // угол при левой вершине (A)
  inner2?: string; // угол при верхней вершине (B), необязателен
  exterior?: string; // внешний угол при правой вершине (C)
}) {
  const apex = { x: 110, y: 30 };
  const left = { x: 50, y: 170 };
  const right = { x: 200, y: 170 };
  const ext = { x: 270, y: 170 };

  return (
    <svg viewBox="0 0 300 200" className="h-full w-full">
      <polygon
        points={`${apex.x},${apex.y} ${left.x},${left.y} ${right.x},${right.y}`}
        fill={D.pineLight}
        stroke={D.ink}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* продолжение стороны за правую вершину */}
      <line x1={right.x} y1={right.y} x2={ext.x} y2={ext.y} stroke={D.ink} strokeWidth="2.5" strokeDasharray="5 4" />
      <Lbl x={left.x + 26} y={left.y - 10} value={inner1} />
      {inner2 && <Lbl x={apex.x} y={apex.y + 26} value={inner2} />}
      <text
        x={right.x + 32}
        y={right.y - 10}
        textAnchor="middle"
        style={isUnknown(exterior) ? unknownStyle : { ...givenStyle, fill: D.pine }}
      >
        {exterior}
      </text>
    </svg>
  );
}
