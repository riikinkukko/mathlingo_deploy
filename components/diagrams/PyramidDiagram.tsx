import { D } from "./shared";

/**
 * Правильная четырёхугольная пирамида — квадратное основание (в
 * косоугольной проекции выглядит как параллелограмм) + вершина сверху,
 * высота падает в центр основания (пунктирная линия SO — часто
 * упоминается в тексте задачи). Подписи: A,B,C,D по основанию, S —
 * вершина, O — центр (показывается только если showCenter=true, так как
 * не в каждой задаче точка O явно нужна).
 */
export default function PyramidDiagram({
  labels = ["A", "B", "C", "D"],
  apexLabel = "S",
  showCenter = false,
  centerLabel = "O",
}: {
  labels?: string[];
  apexLabel?: string;
  showCenter?: boolean;
  centerLabel?: string;
}) {
  const A = { x: 55, y: 165 };
  const B = { x: 195, y: 165 };
  const C = { x: 235, y: 115 };
  const Dd = { x: 95, y: 115 };
  const centerX = (A.x + B.x + C.x + Dd.x) / 4;
  const centerY = (A.y + B.y + C.y + Dd.y) / 4;
  const S = { x: centerX, y: 25 };

  return (
    <svg viewBox="0 0 290 190" className="h-full w-full">
      <line x1={A.x} y1={A.y} x2={Dd.x} y2={Dd.y} stroke={D.inkSoft} strokeWidth="1.5" strokeDasharray="4 3" />
      <line x1={S.x} y1={S.y} x2={A.x} y2={A.y} stroke={D.inkSoft} strokeWidth="1.5" strokeDasharray="4 3" />
      {showCenter && (
        <line x1={S.x} y1={S.y} x2={centerX} y2={centerY} stroke={D.inkSoft} strokeWidth="1.5" strokeDasharray="3 3" />
      )}

      <polygon
        points={`${A.x},${A.y} ${B.x},${B.y} ${C.x},${C.y} ${Dd.x},${Dd.y}`}
        fill={D.pineLight}
        fillOpacity="0.5"
        stroke="none"
      />
      <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke={D.ink} strokeWidth="2" />
      <line x1={B.x} y1={B.y} x2={C.x} y2={C.y} stroke={D.ink} strokeWidth="2" />
      <line x1={C.x} y1={C.y} x2={Dd.x} y2={Dd.y} stroke={D.ink} strokeWidth="2" />

      <line x1={S.x} y1={S.y} x2={B.x} y2={B.y} stroke={D.ink} strokeWidth="2" />
      <line x1={S.x} y1={S.y} x2={C.x} y2={C.y} stroke={D.ink} strokeWidth="2" />
      <line x1={S.x} y1={S.y} x2={Dd.x} y2={Dd.y} stroke={D.ink} strokeWidth="2" />

      {showCenter && <circle cx={centerX} cy={centerY} r="2.5" fill={D.inkSoft} />}

      <text x={A.x - 14} y={A.y + 10} textAnchor="middle" fontSize="14" fontWeight="800" fontStyle="italic" fill={D.ink}>
        {labels[0]}
      </text>
      <text x={B.x + 14} y={B.y + 10} textAnchor="middle" fontSize="14" fontWeight="800" fontStyle="italic" fill={D.ink}>
        {labels[1]}
      </text>
      <text x={C.x + 14} y={C.y - 4} textAnchor="middle" fontSize="14" fontWeight="800" fontStyle="italic" fill={D.ink}>
        {labels[2]}
      </text>
      <text x={Dd.x - 4} y={Dd.y - 10} textAnchor="middle" fontSize="14" fontWeight="800" fontStyle="italic" fill={D.ink}>
        {labels[3]}
      </text>
      <text x={S.x} y={S.y - 10} textAnchor="middle" fontSize="14" fontWeight="800" fontStyle="italic" fill={D.ink}>
        {apexLabel}
      </text>
      {showCenter && (
        <text x={centerX + 4} y={centerY + 16} textAnchor="middle" fontSize="12" fontWeight="700" fontStyle="italic" fill={D.inkSoft}>
          {centerLabel}
        </text>
      )}
    </svg>
  );
}
