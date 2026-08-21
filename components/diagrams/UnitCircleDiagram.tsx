import { D } from "./shared";

// Табличные углы (в градусах), по которым обычно ориентируются при решении
// тригонометрических задач — 16 точек вдоль оси X, против часовой стрелки
// (стандартная математическая ориентация).
const TABLE_ANGLES = [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330];

const CX = 150;
const CY = 150;
const R = 110;

function pointOnCircle(deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: CX + R * Math.cos(rad), y: CY - R * Math.sin(rad) };
}

/**
 * Единичная окружность — не иллюстрация КОНКРЕТНОЙ задачи (в отличие от
 * остальных диаграмм), а справочный ШАБЛОН для рисования: ученик открывает
 * черновик (см. DiagramScratchpad) и отмечает поверх неё нужные точки/дуги
 * сам, как делал бы на бумаге при решении тригонометрического уравнения
 * или вычислении выражения. Поэтому осей/подписей ровно столько, сколько
 * нужно для ориентира — не пытаемся предугадать, что именно отметит ученик.
 */
export default function UnitCircleDiagram() {
  return (
    <svg viewBox="0 0 300 300" className="h-full w-full">
      <circle cx={CX} cy={CY} r={R} fill={D.pineLight} stroke={D.ink} strokeWidth="2" />

      <line x1={CX - R - 20} y1={CY} x2={CX + R + 20} y2={CY} stroke={D.inkSoft} strokeWidth="1.5" />
      <line x1={CX} y1={CY - R - 20} x2={CX} y2={CY + R + 20} stroke={D.inkSoft} strokeWidth="1.5" />
      <text x={CX + R + 24} y={CY + 4} fontSize="13" fontWeight="700" fill={D.inkSoft}>
        x
      </text>
      <text x={CX - 6} y={CY - R - 24} fontSize="13" fontWeight="700" fill={D.inkSoft}>
        y
      </text>

      {TABLE_ANGLES.map((deg) => {
        const p = pointOnCircle(deg);
        return <circle key={deg} cx={p.x} cy={p.y} r="2.5" fill={D.ink} opacity="0.4" />;
      })}

      <text x={CX + R / 2} y={CY - R / 2} fontSize="12" fontWeight="700" fill={D.inkSoft} opacity="0.6">
        I
      </text>
      <text x={CX - R / 2 - 8} y={CY - R / 2} fontSize="12" fontWeight="700" fill={D.inkSoft} opacity="0.6">
        II
      </text>
      <text x={CX - R / 2 - 12} y={CY + R / 2 + 12} fontSize="12" fontWeight="700" fill={D.inkSoft} opacity="0.6">
        III
      </text>
      <text x={CX + R / 2} y={CY + R / 2 + 12} fontSize="12" fontWeight="700" fill={D.inkSoft} opacity="0.6">
        IV
      </text>
    </svg>
  );
}
