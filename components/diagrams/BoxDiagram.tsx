import { D } from "./shared";

// Косоугольная (кавалерная) проекция — стандартный способ рисовать
// параллелепипед на плоскости от руки и в учебниках: передняя грань —
// обычный прямоугольник, "глубина" уходит под углом со сжатием масштаба
// (иначе куб выглядел бы неестественно вытянутым). Угол взят более
// пологим (ближе к горизонтали), чем в первой версии — при -30° и
// значительном смещении фигура превращалась в плохо читаемый
// параллелограмм; -20° с меньшим смещением даёт узнаваемую "коробку".
const DEPTH_ANGLE = -22; // градусов от горизонтали, вверх-вправо
const DEPTH_SCALE = 0.5; // сжатие по глубине, чтобы сохранить пропорции на глаз
const DEPTH_PX = 70;

function depthOffset(depthPx: number) {
  const rad = (DEPTH_ANGLE * Math.PI) / 180;
  return { dx: depthPx * DEPTH_SCALE * Math.cos(rad), dy: depthPx * DEPTH_SCALE * Math.sin(rad) };
}

/**
 * Прямоугольный параллелепипед (или куб при isCube) в косоугольной
 * проекции — самое частое тело в задачах №3/№14. Показываем ТОЛЬКО
 * буквенные подписи вершин (не числа — те даёт текст задачи), скрытые
 * рёбра (задняя нижняя часть) рисуются пунктиром, как принято от руки.
 * labels — 8 подписей по часовой стрелке: перед-низ (4), затем зад-верх
 * (4), в порядке ABCD (перёд) A₁B₁C₁D₁ (зад/верх).
 */
export default function BoxDiagram({
  labels = ["A", "B", "C", "D", "A₁", "B₁", "C₁", "D₁"],
  isCube = false,
  highlightEdges = [],
}: {
  labels?: string[];
  isCube?: boolean;
  /** Пары индексов вершин (0-7) для дополнительно подсвеченных рёбер —
   * например, диагональ или сечение, важные в конкретной задаче. */
  highlightEdges?: [number, number][];
}) {
  const W = 130; // ширина передней грани
  const H = isCube ? 130 : 90; // высота передней грани
  const originX = 40;
  const originY = 190;
  const { dx, dy } = depthOffset(DEPTH_PX);

  // Вершины передней грани (видимые, снизу вверх): A(низ-лево), B(низ-право), C(верх-право), D(верх-лево)
  const A = { x: originX, y: originY };
  const B = { x: originX + W, y: originY };
  const C = { x: originX + W, y: originY - H };
  const Dd = { x: originX, y: originY - H };
  // Задняя грань — та же прямоугольная форма, сдвинутая на (dx,-dy) (в SVG y растёт вниз, глубина уходит вверх)
  const A1 = { x: A.x + dx, y: A.y - dy };
  const B1 = { x: B.x + dx, y: B.y - dy };
  const C1 = { x: C.x + dx, y: C.y - dy };
  const D1 = { x: Dd.x + dx, y: Dd.y - dy };

  const pts = [A, B, C, Dd, A1, B1, C1, D1];
  const solidEdges: [number, number][] = [
    [0, 1], [1, 2], [2, 3], [3, 0], // передняя грань — всегда видна
    [1, 5], [2, 6], // видимые рёбра глубины (от B и C)
    [5, 6], [6, 7], // видимые части задней грани (верх и право сверху видны)
  ];
  const dashedEdges: [number, number][] = [
    [0, 4], [3, 7], // скрытые рёбра глубины (от A и D)
    [4, 5], [4, 7], // скрытые части задней грани
  ];

  const labelOffsets = [
    { dx: -14, dy: 10 }, // A
    { dx: 14, dy: 10 }, // B
    { dx: 14, dy: -8 }, // C
    { dx: -14, dy: -8 }, // D
    { dx: -14, dy: 14 }, // A1
    { dx: 14, dy: 6 }, // B1
    { dx: 14, dy: -12 }, // C1
    { dx: -14, dy: -12 }, // D1
  ];

  return (
    <svg viewBox="0 0 260 210" className="h-full w-full">
      {dashedEdges.map(([i, j], k) => (
        <line
          key={`d${k}`}
          x1={pts[i].x}
          y1={pts[i].y}
          x2={pts[j].x}
          y2={pts[j].y}
          stroke={D.inkSoft}
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
      ))}
      <polygon
        points={[A, B, C, Dd].map((p) => `${p.x},${p.y}`).join(" ")}
        fill={D.pineLight}
        fillOpacity="0.6"
        stroke="none"
      />
      {solidEdges.map(([i, j], k) => (
        <line key={`s${k}`} x1={pts[i].x} y1={pts[i].y} x2={pts[j].x} y2={pts[j].y} stroke={D.ink} strokeWidth="2" />
      ))}
      {highlightEdges.map(([i, j], k) => (
        <line
          key={`h${k}`}
          x1={pts[i].x}
          y1={pts[i].y}
          x2={pts[j].x}
          y2={pts[j].y}
          stroke={D.amber}
          strokeWidth="2.5"
        />
      ))}
      {pts.map((p, i) => (
        <text
          key={i}
          x={p.x + labelOffsets[i].dx}
          y={p.y + labelOffsets[i].dy}
          textAnchor="middle"
          fontSize="14"
          fontWeight="800"
          fontStyle="italic"
          fill={D.ink}
        >
          {labels[i]}
        </text>
      ))}
    </svg>
  );
}
