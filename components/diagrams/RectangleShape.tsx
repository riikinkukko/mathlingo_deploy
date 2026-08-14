import { D, givenStyle, unknownStyle, isUnknown } from "./shared";

function Lbl({ x, y, value }: { x: number; y: number; value: string }) {
  return (
    <text x={x} y={y} textAnchor="middle" style={isUnknown(value) ? unknownStyle : givenStyle}>
      {value}
    </text>
  );
}

export default function RectangleShape({
  a = "?",
  b = "?",
  isSquare = false,
  diagonal,
  circumscribed = false,
  radius,
}: {
  a?: string;
  b?: string;
  isSquare?: boolean;
  diagonal?: string;
  circumscribed?: boolean;
  radius?: string;
}) {
  const x0 = isSquare ? 90 : 65;
  const x1 = isSquare ? 210 : 235;
  const y0 = 55;
  const y1 = 155;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const r = Math.hypot(x1 - x0, y1 - y0) / 2;

  return (
    <svg viewBox="0 0 300 200" className="h-full w-full">
      {circumscribed && (
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={D.line} strokeWidth="2" />
      )}
      <rect
        x={x0}
        y={y0}
        width={x1 - x0}
        height={y1 - y0}
        fill={D.pineLight}
        stroke={D.ink}
        strokeWidth="2.5"
      />
      {diagonal && (
        <>
          <line
            x1={x0}
            y1={y0}
            x2={x1}
            y2={y1}
            stroke={D.pine}
            strokeWidth="2"
            strokeDasharray="5 4"
          />
          <text
            x={cx + 14}
            y={cy - 8}
            textAnchor="middle"
            style={isUnknown(diagonal) ? unknownStyle : givenStyle}
          >
            {diagonal}
          </text>
        </>
      )}
      {circumscribed && radius && (
        <>
          <line x1={cx} y1={cy} x2={cx + r} y2={cy} stroke={D.inkSoft} strokeWidth="1.5" />
          <text x={cx + r / 2} y={cy - 8} textAnchor="middle" style={{ ...givenStyle, fontSize: 13 }}>
            {radius}
          </text>
        </>
      )}
      <Lbl x={cx} y={y1 + 18} value={b} />
      <Lbl x={x0 - 14} y={cy + 5} value={a} />
    </svg>
  );
}
