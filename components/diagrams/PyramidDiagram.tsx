import { D, halo, isUnknown, givenStyle, unknownStyle, Pt } from "./shared";

type PName = "A" | "B" | "C" | "D" | "S" | "O";

interface PyramidSegment {
  from: PName;
  to: PName;
  /** Число или "?" у середины отрезка. */
  label?: string;
  /** Нарисовать отрезок янтарным (диагональ, искомый отрезок). */
  highlight?: boolean;
}

/**
 * Правильная четырёхугольная пирамида SABCD — квадратное основание в
 * косоугольной проекции (A — передняя левая, B — передняя правая, C —
 * задняя правая, D — задняя левая вершина) + вершина S над центром O.
 * Видимы грани SAB и SBC, поэтому пунктиром рисуются рёбра, выходящие из
 * задней вершины D (AD, DC, SD), высота SO и всё, что лежит в основании.
 * segments — дополнительные отрезки/подписи (SO=48, SC=80, BD=? …); их
 * видимость считается автоматически по тем же граням.
 */
export default function PyramidDiagram({
  labels = ["A", "B", "C", "D"],
  apexLabel = "S",
  showCenter = false,
  centerLabel = "O",
  segments = [],
}: {
  labels?: string[];
  apexLabel?: string;
  showCenter?: boolean;
  centerLabel?: string;
  segments?: PyramidSegment[];
}) {
  const A = { x: 50, y: 168 };
  const B = { x: 190, y: 168 };
  const depthDx = 62;
  const depthDy = -40;
  const C = { x: B.x + depthDx, y: B.y + depthDy };
  const Dd = { x: A.x + depthDx, y: A.y + depthDy };
  const O = { x: (A.x + C.x) / 2, y: (A.y + C.y) / 2 };
  const S = { x: O.x, y: 24 };
  const P: Record<PName, Pt> = { A, B, C, D: Dd, S, O };

  const visibleFaces: PName[][] = [
    ["S", "A", "B"],
    ["S", "B", "C"],
  ];
  const isVisible = (a: PName, b: PName) => visibleFaces.some((f) => f.includes(a) && f.includes(b));
  const edges: [PName, PName][] = [
    ["A", "B"], ["B", "C"], ["C", "D"], ["D", "A"],
    ["S", "A"], ["S", "B"], ["S", "C"], ["S", "D"],
  ];
  const isEdge = (a: PName, b: PName) => edges.some(([p, q]) => (p === a && q === b) || (p === b && q === a));
  const segLine = (a: PName, b: PName, key: string, color: string, width: number) => (
    <line
      key={key}
      x1={P[a].x}
      y1={P[a].y}
      x2={P[b].x}
      y2={P[b].y}
      stroke={color}
      strokeWidth={width}
      strokeDasharray={isVisible(a, b) ? undefined : "4 3"}
    />
  );
  const usesCenter = showCenter || segments.some((s) => s.from === "O" || s.to === "O");
  const drawSO = showCenter && !segments.some((s) => (s.from === "S" && s.to === "O") || (s.from === "O" && s.to === "S"));

  const vtx = (p: Pt, dx: number, dy: number, text: string) => (
    <text x={p.x + dx} y={p.y + dy} textAnchor="middle" fontSize="14" fontWeight="800" fontStyle="italic" fill={D.ink}>
      {text}
    </text>
  );

  return (
    <svg viewBox="0 0 300 190" className="h-full w-full">
      <polygon
        points={`${S.x},${S.y} ${A.x},${A.y} ${B.x},${B.y}`}
        fill={D.pineLight}
        fillOpacity="0.55"
        stroke="none"
      />
      <polygon
        points={`${S.x},${S.y} ${B.x},${B.y} ${C.x},${C.y}`}
        fill={D.pineLight}
        fillOpacity="0.3"
        stroke="none"
      />
      {edges
        .filter(([a, b]) => !isVisible(a, b))
        .map(([a, b], k) => segLine(a, b, `d${k}`, D.inkSoft, 1.5))}
      {drawSO && segLine("S", "O", "so", D.inkSoft, 1.5)}
      {segments
        .filter((s) => s.highlight || !isEdge(s.from, s.to))
        .map((s, k) => segLine(s.from, s.to, `x${k}`, s.highlight ? D.amber : D.inkSoft, s.highlight ? 2.5 : 1.5))}
      {edges
        .filter(([a, b]) => isVisible(a, b))
        .map(([a, b], k) => segLine(a, b, `s${k}`, D.ink, 2))}

      {usesCenter && <circle cx={O.x} cy={O.y} r="2.5" fill={D.inkSoft} />}

      {segments
        .filter((s) => s.label)
        .map((s, k) => {
          const p1 = P[s.from];
          const p2 = P[s.to];
          const mx = (p1.x + p2.x) / 2;
          const my = (p1.y + p2.y) / 2;
          // Вертикальная высота SO — подпись справа от неё; остальные —
          // наружу от центра основания.
          let x = mx;
          let y = my;
          if (Math.abs(p1.x - p2.x) < 1) {
            x = mx + 12;
            y = my + 4;
          } else {
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const l = Math.hypot(dx, dy) || 1;
            let nx = -dy / l;
            let ny = dx / l;
            const ref = s.from === "S" || s.to === "S" ? { x: O.x, y: 110 } : O;
            if ((mx - ref.x) * nx + (my - ref.y) * ny < 0) {
              nx = -nx;
              ny = -ny;
            }
            x = mx + nx * 12;
            y = my + ny * 12 + 5;
          }
          return (
            <text
              key={`l${k}`}
              x={x}
              y={y}
              textAnchor={Math.abs(p1.x - p2.x) < 1 ? "start" : "middle"}
              style={{ ...(isUnknown(s.label!) ? unknownStyle : givenStyle), ...halo }}
            >
              {s.label}
            </text>
          );
        })}

      {vtx(A, -12, 10, labels[0])}
      {vtx(B, 12, 12, labels[1])}
      {vtx(C, 13, 2, labels[2])}
      {vtx(Dd, -12, -2, labels[3])}
      {vtx(S, 0, -8, apexLabel)}
      {usesCenter && (
        <text x={O.x - 6} y={O.y + 15} textAnchor="middle" fontSize="12" fontWeight="700" fontStyle="italic" fill={D.inkSoft} style={halo}>
          {centerLabel}
        </text>
      )}
    </svg>
  );
}
