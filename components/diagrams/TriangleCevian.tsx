import { D, givenStyle, unknownStyle, isUnknown, angleArcPath } from "./shared";

function Lbl({ x, y, value }: { x: number; y: number; value: string }) {
  return (
    <text x={x} y={y} textAnchor="middle" style={isUnknown(value) ? unknownStyle : givenStyle}>
      {value}
    </text>
  );
}

export default function TriangleCevian({
  base = "?",
  height,
  variant = "height",
}: {
  base?: string;
  height?: string;
  variant?: "height" | "median" | "bisector";
}) {
  const apex = { x: 140, y: 30 };
  const left = { x: 50, y: 170 };
  const right = { x: 250, y: 170 };
  // Для медианы foot обязан быть ровно серединой основания (иначе это не
  // медиана). Для высоты/биссектрисы — просто условная точка на основании,
  // не обязанная быть серединой.
  const foot =
    variant === "median" ? { x: (left.x + right.x) / 2, y: 170 } : { x: 140, y: 170 };

  return (
    <svg viewBox="0 0 300 200" className="h-full w-full">
      <polygon
        points={`${apex.x},${apex.y} ${left.x},${left.y} ${right.x},${right.y}`}
        fill={D.pineLight}
        stroke={D.ink}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <line
        x1={apex.x}
        y1={apex.y}
        x2={foot.x}
        y2={foot.y}
        stroke={D.ink}
        strokeWidth="2"
        strokeDasharray={variant === "height" ? "5 4" : undefined}
      />
      {variant === "height" && (
        <path
          d={`M ${foot.x - 12} ${foot.y} v -12 h 12`}
          fill="none"
          stroke={D.ink}
          strokeWidth="1.5"
        />
      )}
      {variant === "median" && (
        <>
          <line
            x1={(left.x + foot.x) / 2}
            y1={168}
            x2={(left.x + foot.x) / 2}
            y2={176}
            stroke={D.ink}
            strokeWidth="2"
          />
          <line
            x1={(foot.x + right.x) / 2}
            y1={168}
            x2={(foot.x + right.x) / 2}
            y2={176}
            stroke={D.ink}
            strokeWidth="2"
          />
        </>
      )}
      {variant === "bisector" && (
        <path
          d={angleArcPath(apex.x, apex.y, left.x, left.y, right.x, right.y, 26)}
          fill="none"
          stroke={D.pine}
          strokeWidth="1.5"
        />
      )}
      {variant === "height" && height && <Lbl x={foot.x + 26} y={100} value={height} />}
      <Lbl x={150} y={190} value={base} />
    </svg>
  );
}
