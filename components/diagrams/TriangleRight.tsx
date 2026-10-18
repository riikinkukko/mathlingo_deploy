import { D, givenStyle, unknownStyle, isUnknown, VertexLabel, halo, num, rightAnglePath } from "./shared";

function Lbl({ x, y, value, anchor = "middle" }: { x: number; y: number; value: string; anchor?: "start" | "middle" | "end" }) {
  return (
    <text x={x} y={y} textAnchor={anchor} style={{ ...(isUnknown(value) ? unknownStyle : givenStyle), ...halo }}>
      {value}
    </text>
  );
}

/**
 * Прямоугольный треугольник: прямой угол слева внизу (C), a — вертикальный
 * катет, b — горизонтальный, c — гипотенуза. Если a и b — числа, отношение
 * катетов на рисунке следует условию (в пределах 0.3…1.2). Пустая строка
 * в a/b/c скрывает подпись.
 * altitude — высота из прямого угла на гипотенузу (пунктир, подпись,
 * основание H); medianToHyp — медиана из прямого угла к гипотенузе (M).
 */
export default function TriangleRight({
  a = "?",
  b = "?",
  c = "?",
  labelTop = "A",
  labelRight = "B",
  labelCorner = "C",
  altitude,
  medianToHyp,
  labelFoot,
}: {
  a?: string; // вертикальный катет
  b?: string; // горизонтальный катет
  c?: string; // гипотенуза
  labelTop?: string;
  labelRight?: string;
  labelCorner?: string; // вершина прямого угла
  altitude?: string;
  medianToHyp?: string;
  labelFoot?: string;
}) {
  const na = num(a);
  const nb = num(b);
  const nc = num(c);
  // Отношение вертикального катета к горизонтальному.
  let ratio = 140 / 180;
  if (na && nb) ratio = na / nb;
  else if (na && nc && nc > na) ratio = na / Math.sqrt(nc * nc - na * na);
  else if (nb && nc && nc > nb) ratio = Math.sqrt(nc * nc - nb * nb) / nb;
  ratio = Math.min(1.2, Math.max(0.3, ratio));
  let W = 180;
  let H = W * ratio;
  if (H > 140) {
    H = 140;
    W = H / ratio;
  }
  const bottomY = Math.min(172, 100 + H / 2 + 6);
  const bottomLeft = { x: 150 - W / 2 - 8, y: bottomY };
  const bottomRight = { x: bottomLeft.x + W, y: bottomY };
  const top = { x: bottomLeft.x, y: bottomY - H };

  // Основание высоты из C на гипотенузу.
  const hx = bottomRight.x - top.x;
  const hy = bottomRight.y - top.y;
  const tt = ((bottomLeft.x - top.x) * hx + (bottomLeft.y - top.y) * hy) / (hx * hx + hy * hy);
  const Hf = { x: top.x + hx * tt, y: top.y + hy * tt };
  const M = { x: (top.x + bottomRight.x) / 2, y: (top.y + bottomRight.y) / 2 };
  // Нормаль к гипотенузе наружу (вверх-вправо).
  const hl = Math.hypot(hx, hy);
  const nx = hy / hl;
  const ny = -hx / hl;

  return (
    <svg viewBox="0 0 300 200" className="h-full w-full">
      <polygon
        points={`${top.x},${top.y} ${bottomLeft.x},${bottomLeft.y} ${bottomRight.x},${bottomRight.y}`}
        fill={D.pineLight}
        stroke={D.ink}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* маркер прямого угла */}
      <path d={`M ${bottomLeft.x} ${bottomLeft.y - 14} h 14 v 14`} fill="none" stroke={D.ink} strokeWidth="2" />
      {altitude !== undefined && (
        <>
          <line x1={bottomLeft.x} y1={bottomLeft.y} x2={Hf.x} y2={Hf.y} stroke={D.amber} strokeWidth="2" strokeDasharray="5 4" />
          <path d={rightAnglePath(Hf, bottomLeft, bottomRight, 9)} fill="none" stroke={D.ink} strokeWidth="1.5" />
          {altitude && (
            <Lbl x={(bottomLeft.x + Hf.x) / 2 + 6} y={(bottomLeft.y + Hf.y) / 2 + 18} value={altitude} anchor="start" />
          )}
          <VertexLabel x={Hf.x} y={Hf.y} dx={nx * 12} dy={ny * 12 + 4}>
            {labelFoot ?? "H"}
          </VertexLabel>
        </>
      )}
      {medianToHyp !== undefined && (
        <>
          <line x1={bottomLeft.x} y1={bottomLeft.y} x2={M.x} y2={M.y} stroke={D.amber} strokeWidth="2" />
          {medianToHyp && <Lbl x={(bottomLeft.x + M.x) / 2 + 4} y={(bottomLeft.y + M.y) / 2 + 18} value={medianToHyp} anchor="start" />}
          <VertexLabel x={M.x} y={M.y} dx={nx * 12} dy={ny * 12 + 4}>
            {labelFoot ?? "M"}
          </VertexLabel>
        </>
      )}
      {a && <Lbl x={bottomLeft.x - 10} y={(top.y + bottomLeft.y) / 2 + 5} value={a} anchor="end" />}
      {b && <Lbl x={(bottomLeft.x + bottomRight.x) / 2} y={bottomY + 19} value={b} />}
      {c &&
        (() => {
          // с высотой/медианой середина гипотенузы занята подписью точки — сдвигаем к вершине A
          const t = altitude !== undefined || medianToHyp !== undefined ? 0.3 : 0.5;
          const q = { x: top.x + hx * t, y: top.y + hy * t };
          return <Lbl x={q.x + nx * 16} y={q.y + ny * 16 + 5} value={c} />;
        })()}
      <VertexLabel x={top.x} y={top.y} dx={-4} dy={-8}>
        {labelTop}
      </VertexLabel>
      <VertexLabel x={bottomLeft.x} y={bottomLeft.y} dx={-12} dy={14}>
        {labelCorner}
      </VertexLabel>
      <VertexLabel x={bottomRight.x} y={bottomRight.y} dx={12} dy={14}>
        {labelRight}
      </VertexLabel>
    </svg>
  );
}
