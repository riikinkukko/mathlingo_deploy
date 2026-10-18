import { D, fitPoints, halo, isUnknown, givenStyle, unknownStyle, Pt } from "./shared";

interface EdgeLabel {
  i: number;
  j: number;
  label: string;
}

/**
 * Прямая треугольная призма в принятой в ЕГЭ ориентации: основание ABC
 * лежит горизонтально внизу (A — слева сзади, B — спереди, C — справа
 * сзади), боковые рёбра AA₁, BB₁, CC₁ вертикальны, A₁B₁C₁ — верхнее
 * основание. Смотрим сверху-спереди, поэтому невидимо только заднее ребро
 * нижнего основания AC.
 * labels — [A, B, C, A₁, B₁, C₁] (индексы 0–5 для highlightEdges/edgeLabels).
 * midSection — сечение плоскостью через среднюю линию основания,
 * параллельную AC (и боковой грани AA₁C₁C): отсекает призму при вершине B.
 */
export default function TriangularPrismDiagram({
  labels = ["A", "B", "C", "A₁", "B₁", "C₁"],
  midSection = false,
  highlightEdges = [],
  edgeLabels = [],
}: {
  labels?: string[];
  midSection?: boolean;
  /** Отрезки между вершинами (индексы 0–5), выделяемые янтарным; видимость
   * считается по граням автоматически. */
  highlightEdges?: [number, number][];
  edgeLabels?: EdgeLabel[];
}) {
  const H = 1.15;
  const base: Pt[] = [
    { x: 0, y: 0 }, // A
    { x: 0.62, y: 0.42 }, // B (ближе к зрителю — ниже на рисунке)
    { x: 1.6, y: 0 }, // C
  ];
  const raw = [...base, ...base.map((p) => ({ x: p.x, y: p.y - H }))];
  const { map } = fitPoints(raw, { x0: 34, y0: 24, x1: 216, y1: 182 });
  const pts = raw.map(map);
  const center = {
    x: (pts[0].x + pts[1].x + pts[2].x) / 3,
    y: (pts[0].y + pts[3].y) / 2,
  };

  const visibleFaces = [
    [0, 1, 4, 3],
    [1, 2, 5, 4],
    [3, 4, 5],
  ];
  const isVisible = (i: number, j: number) => visibleFaces.some((f) => f.includes(i) && f.includes(j));
  const edges: [number, number][] = [
    [0, 1], [1, 2], [2, 0],
    [3, 4], [4, 5], [5, 3],
    [0, 3], [1, 4], [2, 5],
  ];

  const seg = (p: Pt, q: Pt, key: string, color: string, width: number, dashed: boolean) => (
    <line key={key} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={color} strokeWidth={width} strokeDasharray={dashed ? "4 3" : undefined} />
  );
  const mid = (p: Pt, q: Pt): Pt => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });

  const labelOffsets: Pt[] = [
    { x: -12, y: 4 }, // A
    { x: 0, y: 18 }, // B
    { x: 12, y: 4 }, // C
    { x: -12, y: 0 }, // A₁
    { x: 2, y: -8 }, // B₁ — внутри верхнего треугольника, над вершиной
    { x: 13, y: 0 }, // C₁
  ];

  const M = mid(pts[1], pts[0]);
  const N = mid(pts[1], pts[2]);
  const M1 = mid(pts[4], pts[3]);
  const N1 = mid(pts[4], pts[5]);

  return (
    <svg viewBox="0 0 250 205" className="h-full w-full">
      <polygon points={[0, 1, 4, 3].map((i) => `${pts[i].x},${pts[i].y}`).join(" ")} fill={D.pineLight} fillOpacity="0.55" />
      <polygon points={[1, 2, 5, 4].map((i) => `${pts[i].x},${pts[i].y}`).join(" ")} fill={D.pineLight} fillOpacity="0.35" />

      {edges.filter(([i, j]) => !isVisible(i, j)).map(([i, j], k) => seg(pts[i], pts[j], `d${k}`, D.inkSoft, 1.5, true))}

      {midSection && (
        <>
          <polygon
            points={[M, N, N1, M1].map((p) => `${p.x},${p.y}`).join(" ")}
            fill={D.amber}
            fillOpacity="0.22"
            stroke="none"
          />
          {seg(M, N, "mn", D.amber, 2, true)}
        </>
      )}

      {edges.filter(([i, j]) => isVisible(i, j)).map(([i, j], k) => seg(pts[i], pts[j], `s${k}`, D.ink, 2, false))}

      {midSection && (
        <>
          {seg(M1, N1, "m1n1", D.amber, 2.5, false)}
          {seg(M, M1, "mm1", D.amber, 2.5, false)}
          {seg(N, N1, "nn1", D.amber, 2.5, false)}
          {[M, N, M1, N1].map((p, i) => (
            <circle key={`mp${i}`} cx={p.x} cy={p.y} r="2.5" fill={D.amber} />
          ))}
        </>
      )}

      {highlightEdges.map(([i, j], k) => seg(pts[i], pts[j], `h${k}`, D.amber, 2.5, !isVisible(i, j)))}

      {edgeLabels.map((e, k) => {
        const m = mid(pts[e.i], pts[e.j]);
        const dx = m.x - center.x;
        const dy = m.y - center.y;
        const l = Math.hypot(dx, dy) || 1;
        return (
          <text
            key={`l${k}`}
            x={m.x + (dx / l) * 14}
            y={m.y + (dy / l) * 14 + 5}
            textAnchor="middle"
            style={{ ...(isUnknown(e.label) ? unknownStyle : givenStyle), ...halo }}
          >
            {e.label}
          </text>
        );
      })}

      {pts.map((p, i) => (
        <text
          key={i}
          x={p.x + labelOffsets[i].x}
          y={p.y + labelOffsets[i].y + 4}
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
