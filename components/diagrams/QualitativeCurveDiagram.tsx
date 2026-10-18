import { D, halo, subscriptDigits } from "./shared";

interface ControlPoint {
  x: number;
  y: number;
}

interface MarkedX {
  x: number;
  label: string;
}

// Catmull-Rom → кубическая кривая Безье: стандартный способ провести
// ГЛАДКУЮ кривую через произвольный набор точек без острых углов —
// именно так рисуют "от руки" графики в задачах №8 (форма кривой не
// подчиняется никакой формуле, важны только качественные свойства:
// где возрастает/убывает, где ноль).
function catmullRomToBezierPath(pts: { px: number; py: number }[]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].px},${pts[0].py}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.px + (p2.px - p0.px) / 6;
    const c1y = p1.py + (p2.py - p0.py) / 6;
    const c2x = p2.px - (p3.px - p1.px) / 6;
    const c2y = p2.py - (p3.py - p1.py) / 6;
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2.px},${p2.py}`;
  }
  return d;
}

/**
 * Качественный график (не заданный формулой) для задач №8 — "на рисунке
 * изображён график f(x) [или f'(x)], на оси абсцисс отмечены точки
 * x1..xn, определите..." Кривая строится по набору контрольных точек
 * (points, в условных координатах) — их форма важна лишь качественно
 * (где выше/ниже нуля, где растёт/убывает), не количественно.
 * markedXPoints — вертикальные засечки с подписями на оси x, которые
 * фигурируют в тексте задачи (x₁, x₂... или конкретные числа).
 */

export default function QualitativeCurveDiagram({
  points,
  markedXPoints = [],
  markedPoints = [],
  xRange = [-10, 10],
  yRange = [-4, 4],
  grid = true,
}: {
  points: ControlPoint[];
  markedXPoints?: MarkedX[];
  /** Точки на самой кривой (кружки), например точка касания x₀. */
  markedPoints?: ControlPoint[];
  xRange?: [number, number];
  yRange?: [number, number];
  /** Клетчатая сетка с шагом 1 и подписями 0 и 1 на осях — как в реальных
   * задачах №8: без неё нельзя считать координаты с рисунка. */
  grid?: boolean;
}) {
  const W = 300;
  const padX = 14;
  const padY = 12;
  const [xMin, xMax] = xRange;
  const [yMin, yMax] = yRange;

  // Одинаковый масштаб по осям (клетка — квадрат), как в ЕГЭ. Высота
  // viewBox подстраивается под форму области, чтобы широкий график не
  // терялся в пустом холсте.
  const unit = Math.min((W - 2 * padX) / (xMax - xMin), (200 - 2 * padY) / (yMax - yMin));
  const H = Math.max(110, unit * (yMax - yMin) + 2 * padY);
  const offX = (W - unit * (xMax - xMin)) / 2;
  const offY = (H - unit * (yMax - yMin)) / 2;
  const toPx = (x: number, y: number) => ({
    px: offX + (x - xMin) * unit,
    py: H - offY - (y - yMin) * unit,
  });
  const left = toPx(xMin, 0).px;
  const right = toPx(xMax, 0).px;
  const top = toPx(0, yMax).py;
  const bottom = toPx(0, yMin).py;

  const pixelPoints = points.map((p) => toPx(p.x, p.y));
  const pathD = catmullRomToBezierPath(pixelPoints);

  // Ось x всегда стоит ровно на y=0, если 0 входит в yRange (у всех текущих
  // задач это так) — иначе откатываемся на нижнюю границу.
  const zeroInRange = yMin <= 0 && yMax >= 0;
  const xAxisY = zeroInRange ? toPx(0, 0).py : bottom;
  const originX = toPx(Math.max(xMin, Math.min(0, xMax)), 0).px;

  // Приблизительное значение кривой в точке x (линейно между контрольными
  // точками) — чтобы ставить подпись засечки с той стороны оси, где кривой нет.
  const curveYAt = (x: number) => {
    const sorted = [...points].sort((p, q) => p.x - q.x);
    for (let i = 0; i < sorted.length - 1; i++) {
      const p = sorted[i];
      const q = sorted[i + 1];
      if (x >= p.x && x <= q.x) return p.y + ((q.y - p.y) * (x - p.x)) / (q.x - p.x || 1);
    }
    return 0;
  };

  const gridLines = [];
  if (grid) {
    for (let i = Math.ceil(xMin); i <= Math.floor(xMax); i++) {
      const { px } = toPx(i, 0);
      gridLines.push(<line key={`v${i}`} x1={px} y1={top} x2={px} y2={bottom} stroke={D.line} strokeWidth="0.8" />);
    }
    for (let j = Math.ceil(yMin); j <= Math.floor(yMax); j++) {
      const { py } = toPx(0, j);
      gridLines.push(<line key={`h${j}`} x1={left} y1={py} x2={right} y2={py} stroke={D.line} strokeWidth="0.8" />);
    }
  }
  const tickStyle = { fontSize: 11, fontWeight: 700, fill: D.inkSoft, ...halo };
  const markedAt = (x: number) => markedXPoints.some((m) => Math.abs(m.x - x) * unit < 26);
  const one = toPx(1, 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full">
      <defs>
        <marker id="qcArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill={D.inkSoft} />
        </marker>
      </defs>
      {gridLines}
      {/* оси со стрелками */}
      <line x1={left} y1={xAxisY} x2={right + 6} y2={xAxisY} stroke={D.inkSoft} strokeWidth="1.5" markerEnd="url(#qcArrow)" />
      <line x1={originX} y1={bottom} x2={originX} y2={top - 6} stroke={D.inkSoft} strokeWidth="1.5" markerEnd="url(#qcArrow)" />
      <text x={right + 2} y={xAxisY + 15} textAnchor="end" fontSize="13" fontWeight="700" fontStyle="italic" fill={D.inkSoft} style={halo}>
        x
      </text>
      <text x={originX - 6} y={top + 6} textAnchor="end" fontSize="13" fontWeight="700" fontStyle="italic" fill={D.inkSoft} style={halo}>
        y
      </text>

      {/* сама кривая */}
      <path d={pathD} fill="none" stroke={D.pine} strokeWidth="2.5" />

      {grid && zeroInRange && xMin <= 0 && xMax >= 1 && (
        <>
          {!markedXPoints.some((m) => m.x < 0 && -m.x * unit < 24) && (
            <text x={originX - 3} y={xAxisY + 12} textAnchor="end" style={tickStyle}>
              0
            </text>
          )}
          {!markedAt(1) && (
            <>
              <line x1={one.px} y1={xAxisY - 3} x2={one.px} y2={xAxisY + 3} stroke={D.inkSoft} strokeWidth="1.5" />
              <text x={one.px} y={xAxisY + 12} textAnchor="middle" style={tickStyle}>
                1
              </text>
            </>
          )}
          {yMax >= 1 && (
            <>
              <line x1={originX - 3} y1={one.py} x2={originX + 3} y2={one.py} stroke={D.inkSoft} strokeWidth="1.5" />
              <text x={originX - 4} y={one.py + 4} textAnchor="end" style={tickStyle}>
                1
              </text>
            </>
          )}
        </>
      )}

      {markedPoints.map((p, i) => {
        const { px, py } = toPx(p.x, p.y);
        return <circle key={`mp${i}`} cx={px} cy={py} r="3.5" fill={D.amber} stroke="white" strokeWidth="1.2" />;
      })}

      {/* отмеченные точки на оси x — засечка + подпись с той стороны оси, где нет кривой */}
      {markedXPoints.map((mp, i) => {
        const { px } = toPx(mp.x, 0);
        const below = curveYAt(mp.x) >= 0;
        return (
          <g key={i}>
            <line x1={px} y1={xAxisY - 4} x2={px} y2={xAxisY + 4} stroke={D.ink} strokeWidth="1.5" />
            <text
              x={px}
              y={below ? xAxisY + 15 : xAxisY - 7}
              textAnchor="middle"
              fontSize="12"
              fontWeight="700"
              fontStyle="italic"
              fill={D.ink}
              style={halo}
            >
              {subscriptDigits(mp.label).replace(/^-/, "−")}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
