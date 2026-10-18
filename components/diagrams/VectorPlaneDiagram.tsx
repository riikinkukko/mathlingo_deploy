import { D, halo } from "./shared";

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
  // Альбомный холст + клетка, подобранная по самим векторам (с запасом в
  // клетку), — чтобы на телефоне подписи были читаемыми, а концы векторов
  // никогда не выпадали за край. range оставлен в API для совместимости.
  void range;
  const W = 320;
  const H = 220;
  const PAD = 8;
  const xsAll = [0, ...vectors.flatMap((v) => [v.from[0], v.to[0]])];
  const ysAll = [0, ...vectors.flatMap((v) => [v.from[1], v.to[1]])];
  let xMin = Math.min(...xsAll) - 1;
  let xMax = Math.max(...xsAll) + 1;
  let yMin = Math.min(...ysAll) - 1;
  let yMax = Math.max(...ysAll) + 1;
  const grow = (lo: number, hi: number, min: number): [number, number] => {
    const d = hi - lo;
    return d >= min ? [lo, hi] : [lo - (min - d) / 2, hi + (min - d) / 2];
  };
  [xMin, xMax] = grow(xMin, xMax, 6);
  [yMin, yMax] = grow(yMin, yMax, 5);
  const CELL = Math.min((W - 2 * PAD) / (xMax - xMin), (H - 2 * PAD) / (yMax - yMin));
  const CX = W / 2 - ((xMin + xMax) / 2) * CELL;
  const CY = H / 2 + ((yMin + yMax) / 2) * CELL;
  const toPx = (x: number, y: number) => ({ px: CX + x * CELL, py: CY - y * CELL });

  const gridLines = [];
  for (let i = Math.ceil(-CX / CELL); i <= Math.floor((W - CX) / CELL); i++) {
    const { px } = toPx(i, 0);
    gridLines.push(<line key={`v${i}`} x1={px} y1={0} x2={px} y2={H} stroke={D.line} strokeWidth="1" />);
  }
  for (let j = Math.ceil((CY - H) / CELL); j <= Math.floor(CY / CELL); j++) {
    const { py } = toPx(0, j);
    gridLines.push(<line key={`h${j}`} x1={0} y1={py} x2={W} y2={py} stroke={D.line} strokeWidth="1" />);
  }
  const tickFont = { fontSize: 14, fontWeight: 700, fill: D.ink, ...halo };
  const axisFont = { fontSize: 16, fontWeight: 700, fontStyle: "italic" as const, fill: D.ink, ...halo };
  const one = toPx(1, 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full">
      <defs>
        <marker id="vecArrowPine" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill={D.pine} />
        </marker>
        <marker id="vecArrowAmber" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill={D.amber} />
        </marker>
        <marker id="vecAxisArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill={D.ink} />
        </marker>
      </defs>

      {gridLines}
      {/* оси со стрелками, 0 и 1 — как в ЕГЭ */}
      <line x1={0} y1={CY} x2={W - 2} y2={CY} stroke={D.ink} strokeWidth="1.5" markerEnd="url(#vecAxisArrow)" />
      <line x1={CX} y1={H} x2={CX} y2={2} stroke={D.ink} strokeWidth="1.5" markerEnd="url(#vecAxisArrow)" />
      <text x={W - 6} y={CY - 8} textAnchor="end" style={axisFont}>
        x
      </text>
      <text x={CX + 8} y={16} textAnchor="start" style={axisFont}>
        y
      </text>
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

      {vectors.map((v, i) => {
        const from = toPx(v.from[0], v.from[1]);
        const to = toPx(v.to[0], v.to[1]);
        const color = v.color === "amber" ? D.amber : D.pine;
        const marker = v.color === "amber" ? "url(#vecArrowAmber)" : "url(#vecArrowPine)";
        // Подпись — на 60% длины от начала, со смещением по нормали: у
        // векторов из одной точки подписи не сходятся в начале координат.
        const lx = from.px + (to.px - from.px) * 0.6;
        const ly = from.py + (to.py - from.py) * 0.6;
        const dx = to.py - from.py;
        const dy = from.px - to.px;
        const len = Math.hypot(dx, dy) || 1;
        const offX = (dx / len) * 13;
        const offY = (dy / len) * 13;
        return (
          <g key={i}>
            <line x1={from.px} y1={from.py} x2={to.px} y2={to.py} stroke={color} strokeWidth="2.5" markerEnd={marker} />
            {v.label && (
              <text
                x={lx + offX}
                y={ly + offY + 6}
                textAnchor="middle"
                fontSize="18"
                fontWeight="800"
                fontStyle="italic"
                fill={color}
                style={halo}
              >
                {v.label}
                <tspan dx="-11" dy="-11" fontSize="12" fontStyle="normal">
                  →
                </tspan>
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
