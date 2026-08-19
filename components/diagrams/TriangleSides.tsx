import { D, givenStyle, unknownStyle, isUnknown, VertexLabel } from "./shared";

function Lbl({ x, y, value }: { x: number; y: number; value: string }) {
  return (
    <text x={x} y={y} textAnchor="middle" style={isUnknown(value) ? unknownStyle : givenStyle}>
      {value}
    </text>
  );
}

export default function TriangleSides({
  a = "?",
  b = "?",
  c = "?",
  labelA = "A",
  labelB = "B",
  labelC = "C",
}: {
  a?: string; // левая сторона
  b?: string; // нижняя (основание)
  c?: string; // правая сторона
  labelA?: string; // вершина слева внизу
  labelB?: string; // вершина справа внизу
  labelC?: string; // верхняя вершина
}) {
  const apex = { x: 130, y: 28 };
  const left = { x: 55, y: 172 };
  const right = { x: 245, y: 172 };

  return (
    <svg viewBox="0 0 300 200" className="h-full w-full">
      <polygon
        points={`${apex.x},${apex.y} ${left.x},${left.y} ${right.x},${right.y}`}
        fill={D.pineLight}
        stroke={D.ink}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <Lbl x={(apex.x + left.x) / 2 - 18} y={(apex.y + left.y) / 2} value={a} />
      <Lbl x={150} y={190} value={b} />
      <Lbl x={(apex.x + right.x) / 2 + 18} y={(apex.y + right.y) / 2} value={c} />
      <VertexLabel x={apex.x} y={apex.y} dy={-10}>
        {labelC}
      </VertexLabel>
      <VertexLabel x={left.x} y={left.y} dx={-14} dy={14}>
        {labelA}
      </VertexLabel>
      <VertexLabel x={right.x} y={right.y} dx={14} dy={14}>
        {labelB}
      </VertexLabel>
    </svg>
  );
}
