import { D } from "./shared";

/**
 * Треугольная призма (прямая) — два треугольных основания, соединённые
 * тремя боковыми рёбрами. Задняя вершина треугольника выше по глубине —
 * её рёбра к передним вершинам частично скрыты (пунктир), как и у
 * остальных 3D-диаграмм в проекте (BoxDiagram, PyramidDiagram).
 */
export default function TriangularPrismDiagram({
  labels = ["A", "B", "C", "A₁", "B₁", "C₁"],
}: {
  labels?: string[];
}) {
  // Переднее основание — треугольник ABC
  const A = { x: 60, y: 175 };
  const B = { x: 170, y: 175 };
  const C = { x: 115, y: 90 };
  // Смещение "вглубь" (то же косоугольное направление, что и в BoxDiagram)
  const dx = 55;
  const dy = -28;
  const A1 = { x: A.x + dx, y: A.y + dy };
  const B1 = { x: B.x + dx, y: B.y + dy };
  const C1 = { x: C.x + dx, y: C.y + dy };

  return (
    <svg viewBox="0 0 250 200" className="h-full w-full">
      {/* заднее основание — целиком видно (тело призмы его не загораживает) */}
      <polygon
        points={`${A1.x},${A1.y} ${B1.x},${B1.y} ${C1.x},${C1.y}`}
        fill={D.pineLight}
        fillOpacity="0.35"
        stroke={D.ink}
        strokeWidth="1.5"
      />

      {/* боковая грань — заливка между основаниями */}
      <polygon
        points={`${A.x},${A.y} ${B.x},${B.y} ${B1.x},${B1.y} ${A1.x},${A1.y}`}
        fill={D.pineLight}
        fillOpacity="0.5"
      />

      {/* переднее основание — сплошное, поверх заливки */}
      <polygon
        points={`${A.x},${A.y} ${B.x},${B.y} ${C.x},${C.y}`}
        fill={D.pineLight}
        fillOpacity="0.6"
        stroke={D.ink}
        strokeWidth="2"
      />

      {/* боковые рёбра — все видимы (призма выпуклая, тело не загораживает боковые рёбра спереди) */}
      <line x1={A.x} y1={A.y} x2={A1.x} y2={A1.y} stroke={D.ink} strokeWidth="2" />
      <line x1={B.x} y1={B.y} x2={B1.x} y2={B1.y} stroke={D.ink} strokeWidth="2" />
      <line x1={C.x} y1={C.y} x2={C1.x} y2={C1.y} stroke={D.inkSoft} strokeWidth="1.5" strokeDasharray="4 3" />

      {/* подписи вершин */}
      <text x={A.x - 12} y={A.y + 10} textAnchor="middle" fontSize="14" fontWeight="800" fontStyle="italic" fill={D.ink}>
        {labels[0]}
      </text>
      <text x={B.x + 12} y={B.y + 10} textAnchor="middle" fontSize="14" fontWeight="800" fontStyle="italic" fill={D.ink}>
        {labels[1]}
      </text>
      <text x={C.x} y={C.y - 10} textAnchor="middle" fontSize="14" fontWeight="800" fontStyle="italic" fill={D.ink}>
        {labels[2]}
      </text>
      <text x={A1.x - 4} y={A1.y - 8} textAnchor="middle" fontSize="13" fontWeight="800" fontStyle="italic" fill={D.ink}>
        {labels[3]}
      </text>
      <text x={B1.x + 14} y={B1.y + 4} textAnchor="middle" fontSize="13" fontWeight="800" fontStyle="italic" fill={D.ink}>
        {labels[4]}
      </text>
      <text x={C1.x + 12} y={C1.y - 6} textAnchor="middle" fontSize="13" fontWeight="800" fontStyle="italic" fill={D.ink}>
        {labels[5]}
      </text>
    </svg>
  );
}
