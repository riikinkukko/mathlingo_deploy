import { D, givenStyle, unknownStyle, isUnknown, VertexLabel } from "./shared";

function Lbl({ x, y, value }: { x: number; y: number; value: string }) {
  return (
    <text x={x} y={y} textAnchor="middle" style={isUnknown(value) ? unknownStyle : givenStyle}>
      {value}
    </text>
  );
}

export default function TriangleSimilarPair({
  small = "?",
  large = "?",
  factor = "×?",
}: {
  small?: string;
  large?: string;
  factor?: string;
}) {
  return (
    <svg viewBox="0 0 300 200" className="h-full w-full">
      <polygon
        points="50,150 100,150 50,100"
        fill={D.pineLight}
        stroke={D.ink}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <Lbl x={45} y={175} value={small} />
      {/* Штрихованная нотация (A'B'C') — стандартное обозначение подобной
          пары в школьной программе, ученику сразу ясно, что это два разных
          треугольника, а не продолжение одной фигуры. */}
      <VertexLabel x={50} y={100} dx={-8} dy={-6}>
        A
      </VertexLabel>
      <VertexLabel x={50} y={150} dx={-10} dy={12}>
        B
      </VertexLabel>
      <VertexLabel x={100} y={150} dx={10} dy={12}>
        C
      </VertexLabel>

      <path
        d="M 120 125 L 165 125"
        stroke={D.inkSoft}
        strokeWidth="2"
        markerEnd="url(#arrow)"
        fill="none"
      />
      <text x={142} y={115} textAnchor="middle" style={{ ...givenStyle, fontSize: 13 }}>
        {factor}
      </text>

      <polygon
        points="180,150 260,150 180,70"
        fill={D.pineLight}
        stroke={D.ink}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <Lbl x={220} y={175} value={large} />
      <VertexLabel x={180} y={70} dx={-10} dy={-6}>
        A'
      </VertexLabel>
      <VertexLabel x={180} y={150} dx={-12} dy={12}>
        B'
      </VertexLabel>
      <VertexLabel x={260} y={150} dx={12} dy={12}>
        C'
      </VertexLabel>

      <defs>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill={D.inkSoft} />
        </marker>
      </defs>
    </svg>
  );
}
