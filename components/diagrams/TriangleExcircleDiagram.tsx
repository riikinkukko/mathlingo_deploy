import { D, VertexLabel } from "./shared";

/**
 * Треугольник (обычно равнобедренный) с вневписанной окружностью,
 * касающейся одной стороны и продолжений двух других — конструкция леммы
 * о трезубце и связанных задач (глава «Окружность», навык «Лемма о
 * трезубце»). Окружность расположена снаружи треугольника, "под"
 * стороной BC.
 */
export default function TriangleExcircleDiagram({
  labelA = "A",
  labelB = "B",
  labelC = "C",
  showTangentPoints = true,
}: {
  labelA?: string;
  labelB?: string;
  labelC?: string;
  showTangentPoints?: boolean;
}) {
  const A = { x: 150, y: 30 };
  const B = { x: 95, y: 140 };
  const C = { x: 205, y: 140 };
  const O = { x: 150, y: 205 };
  const r = 62;
  const M = { x: 150, y: 140 }; // касание с BC — по симметрии на середине основания

  // Точки касания с продолжениями боковых сторон — считаем пересечение
  // окружности с прямой AB (продолженной за B) и AC (продолженной за C).
  function tangentOnExtension(from: { x: number; y: number }, through: { x: number; y: number }) {
    const dx = through.x - from.x;
    const dy = through.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const ux = dx / len;
    const uy = dy / len;
    // proекция O на прямую, затем сдвиг вдоль неё на r от точки проекции —
    // достаточно точно визуально для равнобедренного случая (не точная
    // аналитика, чертёж иллюстративный, не измерительный).
    const t = (O.x - from.x) * ux + (O.y - from.y) * uy;
    const px = from.x + ux * t;
    const py = from.y + uy * t;
    return { x: px + ux * 8, y: py + uy * 8 };
  }
  const N = tangentOnExtension(A, B); // на продолжении AB за B
  const N2 = tangentOnExtension(A, C); // на продолжении AC за C

  return (
    <svg viewBox="0 0 300 275" className="h-full w-full">
      {/* сам треугольник */}
      <polygon points={`${A.x},${A.y} ${B.x},${B.y} ${C.x},${C.y}`} fill={D.pineLight} fillOpacity="0.5" />
      <polygon
        points={`${A.x},${A.y} ${B.x},${B.y} ${C.x},${C.y}`}
        fill="none"
        stroke={D.ink}
        strokeWidth="2"
      />

      {/* продолжения сторон AB и AC за B и C — пунктиром, дальше точек касания */}
      <line x1={A.x} y1={A.y} x2={A.x + (N.x - A.x) * 1.15} y2={A.y + (N.y - A.y) * 1.15} stroke={D.inkSoft} strokeWidth="1.5" strokeDasharray="4 3" />
      <line x1={A.x} y1={A.y} x2={A.x + (N2.x - A.x) * 1.15} y2={A.y + (N2.y - A.y) * 1.15} stroke={D.inkSoft} strokeWidth="1.5" strokeDasharray="4 3" />

      {/* вневписанная окружность */}
      <circle cx={O.x} cy={O.y} r={r} fill="none" stroke={D.pine} strokeWidth="2" />
      <circle cx={O.x} cy={O.y} r="2.5" fill={D.inkSoft} />
      <text x={O.x + 6} y={O.y + 4} fontSize="12" fontWeight="700" fontStyle="italic" fill={D.inkSoft}>
        O
      </text>

      {showTangentPoints && (
        <>
          <circle cx={M.x} cy={M.y} r="2.5" fill={D.ink} />
          <circle cx={N.x} cy={N.y} r="2.5" fill={D.ink} />
          <circle cx={N2.x} cy={N2.y} r="2.5" fill={D.ink} />
        </>
      )}

      <VertexLabel x={A.x} y={A.y} dy={-10}>
        {labelA}
      </VertexLabel>
      <VertexLabel x={B.x} y={B.y} dx={-14} dy={10}>
        {labelB}
      </VertexLabel>
      <VertexLabel x={C.x} y={C.y} dx={14} dy={10}>
        {labelC}
      </VertexLabel>
    </svg>
  );
}
