import { D, givenStyle, unknownStyle, isUnknown, VertexLabel } from "./shared";

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
  labelTop = "A",
  labelRight = "B",
  labelCorner = "C",
}: {
  a?: string; // вертикальный катет
  b?: string; // горизонтальный катет
  c?: string; // гипотенуза
  labelTop?: string;
  labelRight?: string;
  labelCorner?: string; // вершина прямого угла
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
      <VertexLabel x={top.x} y={top.y} dx={-4} dy={-10}>
        {labelTop}
      </VertexLabel>
      <VertexLabel x={bottomLeft.x} y={bottomLeft.y} dx={-14} dy={16}>
        {labelCorner}
      </VertexLabel>
      <VertexLabel x={bottomRight.x} y={bottomRight.y} dx={14} dy={16}>
        {labelRight}
      </VertexLabel>
    </svg>
  );
}
