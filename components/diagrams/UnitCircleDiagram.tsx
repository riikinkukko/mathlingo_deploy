import { D } from "./shared";

// Табличные углы (в градусах), по которым обычно ориентируются при решении
// тригонометрических задач — 16 точек вдоль оси X, против часовой стрелки
// (стандартная математическая ориентация).
const TABLE_ANGLES = [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330];

// Холст ближе к альбомному, чем 300×300: в блоке высотой ~160px квадратная
// картинка сжималась вдвое, и подписи становились 5-пиксельными.
const CX = 150;
const CY = 118;
const R = 96;

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
    <svg viewBox="0 0 300 236" className="h-full w-full">
      <circle cx={CX} cy={CY} r={R} fill={D.pineLight} stroke={D.ink} strokeWidth="2" />

      <line x1={CX - R - 22} y1={CY} x2={CX + R + 22} y2={CY} stroke={D.inkSoft} strokeWidth="1.5" />
      <line x1={CX} y1={CY - R - 16} x2={CX} y2={CY + R + 16} stroke={D.inkSoft} strokeWidth="1.5" />
      <text x={CX + R + 20} y={CY - 7} textAnchor="end" fontSize="18" fontWeight="700" fontStyle="italic" fill={D.inkSoft}>
        x
      </text>
      <text x={CX + 8} y={CY - R - 2} fontSize="18" fontWeight="700" fontStyle="italic" fill={D.inkSoft}>
        y
      </text>
      <text x={CX + R + 4} y={CY + 17} fontSize="15" fontWeight="700" fill={D.inkSoft}>
        1
      </text>
      <text x={CX - 6} y={CY + 17} textAnchor="end" fontSize="15" fontWeight="700" fill={D.inkSoft}>
        0
      </text>

      {TABLE_ANGLES.map((deg) => {
        const p = pointOnCircle(deg);
        return <circle key={deg} cx={p.x} cy={p.y} r="3" fill={D.ink} opacity="0.45" />;
      })}

      <text x={CX + R / 2} y={CY - R / 2 + 10} textAnchor="middle" fontSize="18" fontWeight="700" fill={D.inkSoft} opacity="0.6">
        I
      </text>
      <text x={CX - R / 2} y={CY - R / 2 + 10} textAnchor="middle" fontSize="18" fontWeight="700" fill={D.inkSoft} opacity="0.6">
        II
      </text>
      <text x={CX - R / 2} y={CY + R / 2} textAnchor="middle" fontSize="18" fontWeight="700" fill={D.inkSoft} opacity="0.6">
        III
      </text>
      <text x={CX + R / 2} y={CY + R / 2} textAnchor="middle" fontSize="18" fontWeight="700" fill={D.inkSoft} opacity="0.6">
        IV
      </text>
    </svg>
  );
}
