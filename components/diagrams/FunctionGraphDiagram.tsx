import { D } from "./shared";

type FuncType = "linear" | "quadratic" | "hyperbola" | "sqrt" | "exponential" | "logarithm" | "sin" | "cos" | "abs";

interface FuncParams {
  // linear: y=k*x+b
  k?: number;
  b?: number;
  // quadratic: y=a*(x-h)^2+v  (h,v — координаты вершины)
  a?: number;
  h?: number;
  v?: number;
  // hyperbola: y=k/(x-h)+v
  // sqrt: y=a*sqrt(x-h)+v
  // exponential: y=a*base^(x-h)+v
  base?: number;
  // logarithm: y=a*log_base(x-h)+v
}

interface MarkedPoint {
  x: number;
  y: number;
  label?: string;
}

/**
 * Универсальный график функции — не набор отдельных компонентов на
 * каждый тип (как для стереометрии), а один компонент, вычисляющий саму
 * кривую по формуле в момент рендера (сэмплирование y(x) на сетке x,
 * соединение точек плавным путём). Это единственный практичный подход,
 * учитывая как минимум 9 разных семейств функций в материале (прямая,
 * парабола, гипербола, корень, показательная, логарифм, синус/косинус,
 * модуль) — отдельный React-компонент на каждую был бы избыточен.
 *
 * markedPoints — координаты, которые ученик должен "считать" с рисунка
 * (как в реальном ЕГЭ №11), поэтому именно они отмечены и подписаны, а
 * не сама формула — та даётся в тексте задачи, не на картинке.
 */
export default function FunctionGraphDiagram({
  funcType,
  params = {},
  markedPoints = [],
  range = 6,
}: {
  funcType: FuncType;
  params?: FuncParams;
  markedPoints?: MarkedPoint[];
  range?: number;
}) {
  const CELL = 22;
  const CX = 150;
  const CY = 150;
  const toPx = (x: number, y: number) => ({ px: CX + x * CELL, py: CY - y * CELL });

  function evalFunc(x: number): number | null {
    const { k = 1, b = 0, a = 1, h = 0, v = 0, base = Math.E } = params;
    switch (funcType) {
      case "linear":
        return k * x + b;
      case "quadratic":
        return a * (x - h) ** 2 + v;
      case "hyperbola":
        if (Math.abs(x - h) < 1e-6) return null;
        return k / (x - h) + v;
      case "sqrt":
        if (x - h < 0) return null;
        return a * Math.sqrt(x - h) + v;
      case "exponential":
        return a * base ** (x - h) + v;
      case "logarithm":
        if (x - h <= 0) return null;
        return a * (Math.log(x - h) / Math.log(base)) + v;
      case "sin":
        return a * Math.sin(k * (x - h)) + v;
      case "cos":
        return a * Math.cos(k * (x - h)) + v;
      case "abs":
        return a * Math.abs(x - h) + v;
      default:
        return null;
    }
  }

  // Сэмплируем кривую мелким шагом; для функций с разрывом (гипербола)
  // разбиваем на отдельные непрерывные сегменты вместо одной сплошной
  // линии — иначе путь "прошьёт" асимптоту неестественной прямой чертой.
  const step = (range * 2) / 300;
  const segments: { px: number; py: number }[][] = [];
  let current: { px: number; py: number }[] = [];
  for (let x = -range; x <= range; x += step) {
    const y = evalFunc(x);
    if (y === null || !isFinite(y) || Math.abs(y) > range * 1.6) {
      if (current.length > 1) segments.push(current);
      current = [];
      continue;
    }
    const { px, py } = toPx(x, y);
    current.push({ px, py });
  }
  if (current.length > 1) segments.push(current);

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
      {gridLines}
      <line x1={CX - range * CELL} y1={CY} x2={CX + range * CELL} y2={CY} stroke={D.inkSoft} strokeWidth="1.5" />
      <line x1={CX} y1={CY - range * CELL} x2={CX} y2={CY + range * CELL} stroke={D.inkSoft} strokeWidth="1.5" />
      <text x={CX + range * CELL - 10} y={CY - 6} fontSize="12" fontWeight="700" fill={D.inkSoft}>
        x
      </text>
      <text x={CX + 6} y={CY - range * CELL + 12} fontSize="12" fontWeight="700" fill={D.inkSoft}>
        y
      </text>

      {segments.map((seg, i) => (
        <polyline
          key={i}
          points={seg.map((p) => `${p.px},${p.py}`).join(" ")}
          fill="none"
          stroke={D.pine}
          strokeWidth="2.5"
        />
      ))}

      {markedPoints.map((pt, i) => {
        const { px, py } = toPx(pt.x, pt.y);
        return (
          <g key={i}>
            <circle cx={px} cy={py} r="4" fill={D.amber} stroke="white" strokeWidth="1.5" />
          </g>
        );
      })}
    </svg>
  );
}
