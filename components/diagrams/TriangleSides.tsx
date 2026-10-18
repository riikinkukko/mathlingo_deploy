import { D, givenStyle, unknownStyle, isUnknown, VertexLabel, num, fitPoints, segLabelPos, halo, Pt } from "./shared";

function Lbl({ x, y, value }: { x: number; y: number; value: string }) {
  return (
    <text x={x} y={y} textAnchor="middle" style={{ ...(isUnknown(value) ? unknownStyle : givenStyle), ...halo }}>
      {value}
    </text>
  );
}

export default function TriangleSides({
  a = "?",
  b = "?",
  c = "?",
  labelA = "A",
  labelB = "B",
  labelC = "C",
}: {
  a?: string; // левая сторона
  b?: string; // нижняя (основание)
  c?: string; // правая сторона
  labelA?: string; // вершина слева внизу
  labelB?: string; // вершина справа внизу
  labelC?: string; // верхняя вершина
}) {
  let apex: Pt = { x: 130, y: 28 };
  let left: Pt = { x: 55, y: 172 };
  let right: Pt = { x: 245, y: 172 };
  // Если все три стороны — числа (и треугольник существует), строим его
  // по теореме косинусов: тупоугольный 9-10-17 должен и выглядеть тупым.
  const na = num(a);
  const nb = num(b);
  const nc = num(c);
  if (na && nb && nc && na + nb > nc && na + nc > nb && nb + nc > na) {
    const px = (nb * nb + na * na - nc * nc) / (2 * nb);
    const py = Math.sqrt(Math.max(na * na - px * px, 0));
    const raw = [
      { x: 0, y: 0 },
      { x: nb, y: 0 },
      { x: px, y: -py },
    ];
    const { map } = fitPoints(raw, { x0: 45, y0: 30, x1: 255, y1: 172 });
    [left, right, apex] = raw.map(map);
    // прижимаем основание к низу холста
    const shift = 172 - left.y;
    left = { x: left.x, y: left.y + shift };
    right = { x: right.x, y: right.y + shift };
    apex = { x: apex.x, y: apex.y + shift };
  }
  const center = { x: (apex.x + left.x + right.x) / 3, y: (apex.y + left.y + right.y) / 3 };
  const la = segLabelPos(apex, left, center, 14);
  const lc = segLabelPos(apex, right, center, 14);

  return (
    <svg viewBox="0 0 300 200" className="h-full w-full">
      <polygon
        points={`${apex.x},${apex.y} ${left.x},${left.y} ${right.x},${right.y}`}
        fill={D.pineLight}
        stroke={D.ink}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <Lbl x={la.x} y={la.y} value={a} />
      <Lbl x={(left.x + right.x) / 2} y={left.y + 19} value={b} />
      <Lbl x={lc.x} y={lc.y} value={c} />
      <VertexLabel x={apex.x} y={apex.y} dy={-10}>
        {labelC}
      </VertexLabel>
      <VertexLabel x={left.x} y={left.y} dx={-14} dy={14}>
        {labelA}
      </VertexLabel>
      <VertexLabel x={right.x} y={right.y} dx={14} dy={14}>
        {labelB}
      </VertexLabel>
    </svg>
  );
}
