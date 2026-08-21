import { D } from "./shared";

// Единичная клетка сетки в пикселях — подобрана так, чтобы типичный
// диапазон координат задач (примерно -6..6) укладывался в холст с запасом.
const CELL = 24;
const CX = 150; // пиксель, соответствующий x=0
const CY = 150; // пиксель, соответствующий y=0

function toPx(x: number, y: number) {
  return { px: CX + x * CELL, py: CY - y * CELL };
}

interface VectorDef {
  from: [number, number];
  to: [number, number];
  label?: string;
  color?: "pine" | "amber";
}

/**
 * Координатная плоскость с одним или несколькими векторами — не
 * иллюстрация конкретного числового ответа, а точное графическое
 * представление условия (ученик должен САМ снять координаты векторов с
 * рисунка, как в реальном ЕГЭ). Сетка рисуется всегда одного и того же
 * размера — векторы задаются в единицах сетки, не в пикселях, чтобы
 * автор задачи не пересчитывал координаты вручную.
 */
export default function VectorPlaneDiagram({
  vectors = [],
  range = 6,
}: {
  vectors?: VectorDef[];
  range?: number;
}) {
  const gridLines = [];
  for (let i = -range; i <= range; i++) {
    const { px } = toPx(i, 0);
    const { py } = toPx(0, i);
    gridLines.push(
      <line key={`v${i}`} x1={px} y1={CY - range * CELL} x2={px} y2={CY + range * CELL} stroke={D.line} strokeWidth="1" />
    );
    gridLines.push(
      <line key={`h${i}`} x1={CX - range * CELL} y1={py} x2={CX + range * CELL} y2={py} stroke={D.line} strokeWidth="1" />
    );
  }

  return (
    <svg viewBox="0 0 300 300" className="h-full w-full">
      <defs>
        <marker id="vecArrowPine" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill={D.pine} />
        </marker>
        <marker id="vecArrowAmber" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill={D.amber} />
        </marker>
      </defs>

      {gridLines}
      {/* оси выделены чуть темнее сетки */}
      <line x1={CX - range * CELL} y1={CY} x2={CX + range * CELL} y2={CY} stroke={D.inkSoft} strokeWidth="1.5" />
      <line x1={CX} y1={CY - range * CELL} x2={CX} y2={CY + range * CELL} stroke={D.inkSoft} strokeWidth="1.5" />
      <text x={CX + range * CELL - 10} y={CY - 6} fontSize="11" fontWeight="700" fill={D.inkSoft}>
        x
      </text>
      <text x={CX + 6} y={CY - range * CELL + 12} fontSize="11" fontWeight="700" fill={D.inkSoft}>
        y
      </text>

      {vectors.map((v, i) => {
        const from = toPx(v.from[0], v.from[1]);
        const to = toPx(v.to[0], v.to[1]);
        const color = v.color === "amber" ? D.amber : D.pine;
        const marker = v.color === "amber" ? "url(#vecArrowAmber)" : "url(#vecArrowPine)";
        const midX = (from.px + to.px) / 2;
        const midY = (from.py + to.py) / 2;
        // смещаем подпись немного в сторону от линии вектора, чтобы не
        // перекрывать саму стрелку
        const dx = to.py - from.py;
        const dy = from.px - to.px;
        const len = Math.hypot(dx, dy) || 1;
        const offX = (dx / len) * 12;
        const offY = (dy / len) * 12;
        return (
          <g key={i}>
            <line x1={from.px} y1={from.py} x2={to.px} y2={to.py} stroke={color} strokeWidth="2.5" markerEnd={marker} />
            {v.label && (
              <text
                x={midX + offX}
                y={midY + offY}
                textAnchor="middle"
                fontSize="14"
                fontWeight="800"
                fontStyle="italic"
                fill={color}
              >
                {v.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
