import { D, givenStyle, unknownStyle, isUnknown } from "./shared";

function Lbl({ x, y, value }: { x: number; y: number; value: string }) {
  return (
    <text x={x} y={y} textAnchor="middle" style={isUnknown(value) ? unknownStyle : givenStyle}>
      {value}
    </text>
  );
}

export default function TriangleRight({
  a = "?",
  b = "?",
  c = "?",
}: {
  a?: string; // вертикальный катет
  b?: string; // горизонтальный катет
  c?: string; // гипотенуза
}) {
  const bottomLeft = { x: 60, y: 170 };
  const bottomRight = { x: 240, y: 170 };
  const top = { x: 60, y: 30 };

  return (
    <svg viewBox="0 0 300 200" className="h-full w-full">
      <polygon
        points={`${top.x},${top.y} ${bottomLeft.x},${bottomLeft.y} ${bottomRight.x},${bottomRight.y}`}
        fill={D.pineLight}
        stroke={D.ink}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* маркер прямого угла */}
      <path
        d={`M ${bottomLeft.x} ${bottomLeft.y - 16} h 16 v 16`}
        fill="none"
        stroke={D.ink}
        strokeWidth="2"
      />
      <Lbl x={bottomLeft.x - 22} y={100} value={a} />
      <Lbl x={150} y={188} value={b} />
      <Lbl x={165} y={92} value={c} />
    </svg>
  );
}
