import { D, givenStyle, unknownStyle, isUnknown } from "./shared";

function AngleLabel({ x, y, value }: { x: number; y: number; value: string }) {
  return (
    <text x={x} y={y} textAnchor="middle" style={isUnknown(value) ? unknownStyle : givenStyle}>
      {value}
    </text>
  );
}

export default function TriangleAngles({
  a = "?",
  b = "?",
  c = "?",
  symmetric = false,
}: {
  a?: string;
  b?: string;
  c?: string;
  symmetric?: boolean;
}) {
  const apex = symmetric ? { x: 150, y: 28 } : { x: 130, y: 26 };
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
      {symmetric && (
        <>
          <line x1={92} y1={100} x2={100} y2={108} stroke={D.ink} strokeWidth="2" />
          <line x1={208} y1={100} x2={200} y2={108} stroke={D.ink} strokeWidth="2" />
        </>
      )}
      <AngleLabel x={apex.x} y={apex.y + 26} value={c} />
      <AngleLabel x={left.x + 26} y={left.y - 10} value={a} />
      <AngleLabel x={right.x - 26} y={right.y - 10} value={b} />
    </svg>
  );
}
