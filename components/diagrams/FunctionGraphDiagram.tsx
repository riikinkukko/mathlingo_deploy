import { D, halo } from "./shared";

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
  // Холст — альбомный (как контейнер карточки задачи), чтобы при вписывании
  // в блок высотой ~160px подписи не превращались в 5-пиксельные. Масштаб
  // клетки подбирается так, чтобы в кадр гарантированно попали отмеченные
  // точки, начало координат и характерная точка семейства (вершина,
  // центр асимптот…), с запасом; сетка затем заполняет весь холст.
  // (range оставлен в API для совместимости — от него больше ничего не зависит.)
  void range;
  const W = 320;
  const H = 220;
  const PAD = 8;
  const { h: ph = 0, v: pv = 0 } = params;
  const interest: { x: number; y: number }[] = [{ x: 0, y: 0 }, ...markedPoints];
  if (funcType === "quadratic" || funcType === "abs" || funcType === "sqrt" || funcType === "hyperbola") interest.push({ x: ph, y: pv });
  if (funcType === "logarithm") interest.push({ x: ph + 1, y: pv });
  let xMin = Math.min(...interest.map((p) => p.x)) - 2;
  let xMax = Math.max(...interest.map((p) => p.x)) + 2;
  let yMin = Math.min(...interest.map((p) => p.y)) - 1.5;
  let yMax = Math.max(...interest.map((p) => p.y)) + 1.5;
  const grow = (lo: number, hi: number, min: number): [number, number] => {
    const d = hi - lo;
    return d >= min ? [lo, hi] : [lo - (min - d) / 2, hi + (min - d) / 2];
  };
  [xMin, xMax] = grow(xMin, xMax, 7);
  [yMin, yMax] = grow(yMin, yMax, 6);
  const CELL = Math.min((W - 2 * PAD) / (xMax - xMin), (H - 2 * PAD) / (yMax - yMin));
  const CX = W / 2 - ((xMin + xMax) / 2) * CELL;
  const CY = H / 2 + ((yMin + yMax) / 2) * CELL;
  const toPx = (x: number, y: number) => ({ px: CX + x * CELL, py: CY - y * CELL });
  // Видимая область в единицах графика — весь холст.
  const vxMin = -CX / CELL;
  const vxMax = (W - CX) / CELL;
  const vyMin = (CY - H) / CELL;
  const vyMax = CY / CELL;

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

  // Сэмплируем кривую мелким шагом по всей видимой ширине; для функций с
  // разрывом (гипербола) разбиваем на отдельные сегменты. Точки далеко за
  // кадром отбрасываем, остальное обрезает clipPath. Для корня отдельно
  // добавляем точное начало области определения x = h.
  const xs: number[] = [];
  const step = (vxMax - vxMin) / 600;
  for (let x = vxMin; x <= vxMax; x += step) xs.push(x);
  if (funcType === "sqrt" && ph > vxMin && ph < vxMax) {
    xs.push(ph);
    xs.sort((p, q) => p - q);
  }
  const yLimit = (vyMax - vyMin) * 3;
  const segments: { px: number; py: number }[][] = [];
  let current: { px: number; py: number }[] = [];
  let prevX: number | null = null;
  for (const x of xs) {
    const y = evalFunc(x);
    // гипербола: при переходе через асимптоту x = h начинаем новый сегмент
    if (funcType === "hyperbola" && prevX !== null && (prevX - ph) * (x - ph) <= 0) {
      if (current.length > 1) segments.push(current);
      current = [];
    }
    prevX = x;
    if (y === null || !isFinite(y) || Math.abs(y) > yLimit) {
      if (current.length > 1) segments.push(current);
      current = [];
      continue;
    }
    current.push(toPx(x, y));
  }
  if (current.length > 1) segments.push(current);

  const gridLines = [];
  for (let i = Math.ceil(vxMin); i <= Math.floor(vxMax); i++) {
    const { px } = toPx(i, 0);
    gridLines.push(<line key={`v${i}`} x1={px} y1={0} x2={px} y2={H} stroke={D.line} strokeWidth="1" />);
  }
  for (let j = Math.ceil(vyMin); j <= Math.floor(vyMax); j++) {
    const { py } = toPx(0, j);
    gridLines.push(<line key={`h${j}`} x1={0} y1={py} x2={W} y2={py} stroke={D.line} strokeWidth="1" />);
  }
  const axisFont = { fontSize: 16, fontWeight: 700, fontStyle: "italic" as const, fill: D.ink, ...halo };
  const tickFont = { fontSize: 14, fontWeight: 700, fill: D.ink, ...halo };
  const one = toPx(1, 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full">
      <defs>
        <clipPath id="fgClip">
          <rect x={0} y={0} width={W} height={H} />
        </clipPath>
        <marker id="fgArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill={D.ink} />
        </marker>
      </defs>
      {gridLines}
      <line x1={0} y1={CY} x2={W - 2} y2={CY} stroke={D.ink} strokeWidth="1.5" markerEnd="url(#fgArrow)" />
      <line x1={CX} y1={H} x2={CX} y2={2} stroke={D.ink} strokeWidth="1.5" markerEnd="url(#fgArrow)" />

      <g clipPath="url(#fgClip)">
        {segments.map((seg, i) => (
          <polyline
            key={i}
            points={seg.map((p) => `${p.px.toFixed(1)},${p.py.toFixed(1)}`).join(" ")}
            fill="none"
            stroke={D.pine}
            strokeWidth="2.5"
          />
        ))}
      </g>

      {/* 0 и 1 на осях — как в ЕГЭ, иначе масштаб клетки не задан */}
      <text x={CX - 4} y={CY + 15} textAnchor="end" style={tickFont}>
        0
      </text>
      <line x1={one.px} y1={CY - 4} x2={one.px} y2={CY + 4} stroke={D.ink} strokeWidth="1.5" />
      <text x={one.px} y={CY + 16} textAnchor="middle" style={tickFont}>
        1
      </text>
      <line x1={CX - 4} y1={one.py} x2={CX + 4} y2={one.py} stroke={D.ink} strokeWidth="1.5" />
      <text x={CX - 6} y={one.py + 5} textAnchor="end" style={tickFont}>
        1
      </text>
      <text x={W - 6} y={CY - 8} textAnchor="end" style={axisFont}>
        x
      </text>
      <text x={CX + 8} y={16} textAnchor="start" style={axisFont}>
        y
      </text>

      {markedPoints.map((pt, i) => {
        const { px, py } = toPx(pt.x, pt.y);
        return (
          <g key={i}>
            <circle cx={px} cy={py} r="4.5" fill={D.amber} stroke="white" strokeWidth="1.5" />
          </g>
        );
      })}
    </svg>
  );
}
