import { D, givenStyle, unknownStyle, isUnknown, VertexLabel } from "./shared";

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
  labelA = "A",
  labelB = "B",
  labelC = "C",
  labelD = "D",
  halfDiagonal,
}: {
  a?: string;
  b?: string;
  isSquare?: boolean;
  diagonal?: string;
  circumscribed?: boolean;
  radius?: string;
  labelA?: string; // левый верхний
  labelB?: string; // правый верхний
  labelC?: string; // правый нижний
  labelD?: string; // левый нижний
  /** Обе диагонали, точка O их пересечения и подпись отрезка O–C (половина диагонали). */
  halfDiagonal?: string;
}) {
  // Описанная окружность должна целиком помещаться в viewBox высотой 200 —
  // для прямоугольника берём фигуру поменьше.
  const small = circumscribed && !isSquare;
  const x0 = isSquare ? 90 : small ? 90 : 65;
  const x1 = isSquare ? 210 : small ? 210 : 235;
  const y0 = small ? 62 : 55;
  const y1 = small ? 148 : 155;
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
            x={halfDiagonal ? x0 + (x1 - x0) * 0.25 + 14 : cx + 14}
            y={halfDiagonal ? y0 + (y1 - y0) * 0.25 - 6 : cy - 8}
            textAnchor="middle"
            style={isUnknown(diagonal) ? unknownStyle : givenStyle}
          >
            {diagonal}
          </text>
        </>
      )}
      {halfDiagonal && (
        <>
          <line x1={x1} y1={y0} x2={x0} y2={y1} stroke={D.pine} strokeWidth="2" strokeDasharray="5 4" />
          <circle cx={cx} cy={cy} r="3" fill={D.pine} />
          <VertexLabel x={cx} y={cy} dy={20}>
            O
          </VertexLabel>
          <text
            x={cx + (x1 - cx) * 0.5 + 12}
            y={cy + (y1 - cy) * 0.5 - 6}
            textAnchor="start"
            style={isUnknown(halfDiagonal) ? unknownStyle : givenStyle}
          >
            {halfDiagonal}
          </text>
        </>
      )}
      {circumscribed && radius && (
        <>
          {/* радиус — в вершину B (на окружность), а не в сторону */}
          <line x1={cx} y1={cy} x2={x1} y2={y0} stroke={D.inkSoft} strokeWidth="1.5" />
          <circle cx={cx} cy={cy} r="2.5" fill={D.inkSoft} />
          <text x={(cx + x1) / 2 - 6} y={(cy + y0) / 2 - 4} textAnchor="end" style={{ ...givenStyle, fontSize: 13 }}>
            {radius}
          </text>
        </>
      )}
      <Lbl x={cx} y={y1 + 18} value={b} />
      <Lbl x={small ? x0 + 14 : x0 - 14} y={cy + 5} value={a} />
      <VertexLabel x={x0} y={y0} dx={-8} dy={-6}>
        {labelA}
      </VertexLabel>
      <VertexLabel x={x1} y={y0} dx={8} dy={-6}>
        {labelB}
      </VertexLabel>
      <VertexLabel x={x1} y={y1} dx={8} dy={14}>
        {labelC}
      </VertexLabel>
      <VertexLabel x={x0} y={y1} dx={-8} dy={14}>
        {labelD}
      </VertexLabel>
    </svg>
  );
}
