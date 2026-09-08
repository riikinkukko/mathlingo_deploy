import { D } from "./shared";

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
  xRange = [-10, 10],
  yRange = [-4, 4],
}: {
  points: ControlPoint[];
  markedXPoints?: MarkedX[];
  xRange?: [number, number];
  yRange?: [number, number];
}) {
  const W = 300;
  const H = 190;
  const padX = 20;
  const padY = 20;
  const [xMin, xMax] = xRange;
  const [yMin, yMax] = yRange;

  const toPx = (x: number, y: number) => ({
    px: padX + ((x - xMin) / (xMax - xMin)) * (W - 2 * padX),
    py: H - padY - ((y - yMin) / (yMax - yMin)) * (H - 2 * padY),
  });

  const pixelPoints = points.map((p) => toPx(p.x, p.y));
  const pathD = catmullRomToBezierPath(pixelPoints);

  // Раньше горизонтальная линия рисовалась на фиксированной позиции внизу
  // картинки (H-padY) — то есть это была просто нижняя граница системы
  // координат, НЕ настоящая ось y=0, если функция принимала отрицательные
  // значения (а почти все задачи здесь именно такие). Ученик видел
  // кривую, "пересекающую" эту псевдо-ось, хотя на деле она не была
  // осью x вообще. Теперь ось x всегда стоит ровно на y=0, если 0 входит
  // в yRange (у всех текущих задач это так) — иначе (редкий случай,
  // функция целиком выше или ниже нуля) откатываемся на прежнее поведение.
  const zeroInRange = yMin <= 0 && yMax >= 0;
  const xAxisY = zeroInRange ? toPx(0, 0).py : H - padY;
  const originX = toPx(Math.max(xMin, 0), 0).px;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full">
      {/* ось x — всегда на настоящем y=0, не на условной нижней границе */}
      <line x1={padX} y1={xAxisY} x2={W - padX} y2={xAxisY} stroke={D.inkSoft} strokeWidth="1.5" />
      <line x1={originX} y1={padY} x2={originX} y2={H - padY} stroke={D.inkSoft} strokeWidth="1.5" />
      <text x={W - padX - 8} y={xAxisY - 6} fontSize="11" fontWeight="700" fill={D.inkSoft}>
        x
      </text>
      <text x={originX + 6} y={padY + 10} fontSize="11" fontWeight="700" fill={D.inkSoft}>
        y
      </text>

      {/* сама кривая */}
      <path d={pathD} fill="none" stroke={D.pine} strokeWidth="2.5" />

      {/* отмеченные точки на оси x — засечка + подпись, теперь у настоящей оси */}
      {markedXPoints.map((mp, i) => {
        const { px } = toPx(mp.x, 0);
        return (
          <g key={i}>
            <line x1={px} y1={xAxisY - 4} x2={px} y2={xAxisY + 4} stroke={D.ink} strokeWidth="1.5" />
            <text x={px} y={xAxisY + 16} textAnchor="middle" fontSize="11" fontWeight="700" fontStyle="italic" fill={D.ink}>
              {mp.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
