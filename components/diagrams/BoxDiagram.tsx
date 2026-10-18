import { D, fitPoints, halo, isUnknown, givenStyle, unknownStyle, Pt } from "./shared";

// Косоугольная (кавалерная) проекция, как рисуют параллелепипед в ЕГЭ:
// основание ABCD лежит горизонтально (A — передняя левая, B — передняя
// правая, C — задняя правая, D — задняя левая вершина), рёбра AA₁, BB₁…
// вертикальны. Глубина (AD) уходит вверх-вправо под углом DEPTH_ANGLE со
// сжатием DEPTH_SCALE. Смотрим сверху-спереди-справа, поэтому невидимы
// ровно три ребра, выходящие из задней нижней левой вершины D: AD, DC, DD₁.
const DEPTH_ANGLE = 35;
const DEPTH_SCALE = 0.55;

interface EdgeLabel {
  i: number;
  j: number;
  label: string;
}

/**
 * Прямоугольный параллелепипед (или куб при isCube) — самое частое тело
 * в задачах №3/№14.
 * labels — 8 подписей: основание A, B, C, D, затем верх A₁, B₁, C₁, D₁
 * (индексы 0–7 используются в highlightEdges / edgeLabels).
 * size — [AB, AD, AA₁] в любых единицах, чтобы пропорции следовали
 * условию (каждое измерение не меньше 40% от наибольшего, иначе фигура
 * становится нечитаемой).
 */
export default function BoxDiagram({
  labels = ["A", "B", "C", "D", "A₁", "B₁", "C₁", "D₁"],
  isCube = false,
  highlightEdges = [],
  edgeLabels = [],
  size,
}: {
  labels?: string[];
  isCube?: boolean;
  /** Пары индексов вершин (0-7) для дополнительно подсвеченных отрезков —
   * диагональ, сечение и т.п. Видимость (сплошной/пунктир) определяется
   * автоматически: отрезок виден, только если лежит на видимой грани. */
  highlightEdges?: [number, number][];
  /** Числа на рёбрах/отрезках (данные условия или "?"). */
  edgeLabels?: EdgeLabel[];
  size?: [number, number, number];
}) {
  let [w, d, h] = size ?? (isCube ? [1, 1, 1] : [1.35, 1.1, 0.95]);
  const m = Math.max(w, d, h);
  w = Math.max(w, 0.4 * m);
  d = Math.max(d, 0.4 * m);
  h = Math.max(h, 0.4 * m);

  const rad = (DEPTH_ANGLE * Math.PI) / 180;
  const proj = (x: number, y: number, z: number): Pt => ({
    x: x + y * DEPTH_SCALE * Math.cos(rad),
    y: -z - y * DEPTH_SCALE * Math.sin(rad),
  });
  const raw = [
    proj(0, 0, 0), // A
    proj(w, 0, 0), // B
    proj(w, d, 0), // C
    proj(0, d, 0), // D
    proj(0, 0, h), // A₁
    proj(w, 0, h), // B₁
    proj(w, d, h), // C₁
    proj(0, d, h), // D₁
  ];
  const { map } = fitPoints(raw, { x0: 34, y0: 22, x1: 226, y1: 196 });
  const pts = raw.map(map);
  const center = map(proj(w / 2, d / 2, h / 2));

  // Видимые грани: передняя ABB₁A₁, правая BCC₁B₁, верхняя A₁B₁C₁D₁.
  const visibleFaces = [
    [0, 1, 5, 4],
    [1, 2, 6, 5],
    [4, 5, 6, 7],
  ];
  const isVisible = (i: number, j: number) => visibleFaces.some((f) => f.includes(i) && f.includes(j));

  const edges: [number, number][] = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const solidEdges = edges.filter(([i, j]) => isVisible(i, j));
  const dashedEdges = edges.filter(([i, j]) => !isVisible(i, j));

  const line = (i: number, j: number, key: string, color: string, width: number, dashed: boolean) => (
    <line
      key={key}
      x1={pts[i].x}
      y1={pts[i].y}
      x2={pts[j].x}
      y2={pts[j].y}
      stroke={color}
      strokeWidth={width}
      strokeDasharray={dashed ? "4 3" : undefined}
    />
  );

  // Подпись вершины — по направлению «от центра тела»; для скрытой D
  // (она проецируется внутрь передней грани) — чуть влево-вверх.
  const labelPos = (i: number): Pt => {
    const p = pts[i];
    if (i === 3) return { x: p.x - 11, y: p.y - 5 };
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    const l = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / l) * 13, y: p.y + (dy / l) * 13 + 5 };
  };

  return (
    <svg viewBox="0 0 260 215" className="h-full w-full">
      <polygon
        points={[0, 1, 5, 4].map((i) => `${pts[i].x},${pts[i].y}`).join(" ")}
        fill={D.pineLight}
        fillOpacity="0.6"
        stroke="none"
      />
      <polygon
        points={[1, 2, 6, 5].map((i) => `${pts[i].x},${pts[i].y}`).join(" ")}
        fill={D.pineLight}
        fillOpacity="0.35"
        stroke="none"
      />
      {dashedEdges.map(([i, j], k) => line(i, j, `d${k}`, D.inkSoft, 1.5, true))}
      {solidEdges.map(([i, j], k) => line(i, j, `s${k}`, D.ink, 2, false))}
      {highlightEdges.map(([i, j], k) => line(i, j, `h${k}`, D.amber, 2.5, !isVisible(i, j)))}
      {edgeLabels.map((e, k) => {
        const mx = (pts[e.i].x + pts[e.j].x) / 2;
        const my = (pts[e.i].y + pts[e.j].y) / 2;
        const dx = mx - center.x;
        const dy = my - center.y;
        const l = Math.hypot(dx, dy) || 1;
        const off = l < 8 ? 0 : 12;
        return (
          <text
            key={`l${k}`}
            x={mx + (dx / l) * off}
            y={my + (dy / l) * off + 5}
            textAnchor="middle"
            style={{ ...(isUnknown(e.label) ? unknownStyle : givenStyle), ...halo }}
          >
            {e.label}
          </text>
        );
      })}
      {pts.map((p, i) => {
        const lp = labelPos(i);
        return (
          <text
            key={i}
            x={lp.x}
            y={lp.y}
            textAnchor="middle"
            fontSize="14"
            fontWeight="800"
            fontStyle="italic"
            fill={D.ink}
          >
            {labels[i]}
          </text>
        );
      })}
    </svg>
  );
}
