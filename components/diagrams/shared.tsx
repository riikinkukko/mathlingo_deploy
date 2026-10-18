// Единый визуальный язык для всех схем: цвета берём как обычные hex
// (внутри SVG нельзя использовать Tailwind-классы для fill/stroke),
// но они подобраны в тон основной палитре приложения (pine/amber/ink).
export const D = {
  ink: "#132A20",
  inkSoft: "#5C7A6C",
  pine: "#1CAE6B",
  pineLight: "#E1F6EA",
  amber: "#C9820A",
  line: "#B9DCC7",
};

export const labelStyle = {
  fontSize: 14,
  fontWeight: 800,
  fill: D.ink,
  fontFamily: "inherit",
};

export const givenStyle = { ...labelStyle, fill: D.pine };
export const unknownStyle = { ...labelStyle, fill: D.amber };

/** Подпись вершины (A, B, C...) — не значение угла/стороны, а имя самой
 * точки. Раньше на диаграммах были только числа/"?", и ученику было
 * непонятно, что называется "точкой A", если в тексте задачи используются
 * буквы. Рисуется мельче и бледнее основных значений — не должна
 * перетягивать внимание, только служить якорем для текста задачи.
 * dx/dy — смещение от самой вершины наружу фигуры (чтобы не наезжать на
 * стороны и не путаться со значением угла в той же вершине). */
export const vertexLabelStyle = {
  fontSize: 12,
  fontWeight: 700,
  fill: D.inkSoft,
  fontFamily: "inherit",
  fontStyle: "italic" as const,
};

export function VertexLabel({
  x,
  y,
  dx = 0,
  dy = 0,
  children,
}: {
  x: number;
  y: number;
  dx?: number;
  dy?: number;
  children: string;
}) {
  return (
    <text x={x + dx} y={y + dy} textAnchor="middle" style={vertexLabelStyle}>
      {children}
    </text>
  );
}

/** '?' или отмеченное "x" значение красим отдельным цветом — так на схеме сразу видно, что известно, а что нужно найти. */
export function isUnknown(v: string) {
  return v.trim() === "?" || v.trim().toLowerCase() === "x";
}

/** Строит путь дуги угла в вершине (vx,vy), между направлениями на точки
 * (p1x,p1y) и (p2x,p2y), радиусом radius — через интерполяцию углов
 * (полилиния), а не через SVG arc-флаги, которые легко перепутать и
 * получить дугу "с другой стороны" или "вверх ногами". */
export function angleArcPath(
  vx: number,
  vy: number,
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
  radius: number
) {
  const a1 = Math.atan2(p1y - vy, p1x - vx);
  const a2 = Math.atan2(p2y - vy, p2x - vx);
  let delta = a2 - a1;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  const steps = 10;
  const points: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = a1 + (delta * i) / steps;
    const x = vx + radius * Math.cos(t);
    const y = vy + radius * Math.sin(t);
    points.push(`${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return points.join(" ");
}

export type Pt = { x: number; y: number };

/** Вписывает набор точек (любые единицы, ось y вниз, как в SVG) в
 * прямоугольник box с сохранением пропорций и центрированием. Нужен
 * диаграммам, чья форма считается из чисел условия (стороны, отношения):
 * геометрию строим в «условных единицах», а уже потом масштабируем в
 * viewBox — фигура никогда не вылезает за край и не сжимается в точку. */
export function fitPoints(pts: Pt[], box: { x0: number; y0: number; x1: number; y1: number }) {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;
  const s = Math.min((box.x1 - box.x0) / w, (box.y1 - box.y0) / h);
  const ox = box.x0 + (box.x1 - box.x0 - w * s) / 2 - minX * s;
  const oy = box.y0 + (box.y1 - box.y0 - h * s) / 2 - minY * s;
  return { s, map: (p: Pt): Pt => ({ x: ox + p.x * s, y: oy + p.y * s }) };
}

/** Число из подписи условия: "8,5" → 8.5, "80°" → 80, "15" → 15.
 * Для буквенных подписей ("a", "?", "x+4") — null. */
export function num(v: unknown): number | null {
  if (typeof v === "number") return isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const m = v.trim().replace(",", ".").match(/^-?\d+(\.\d+)?(?=°?$)/);
  return m ? Number(m[0]) : null;
}

/** Белая «обводка» под текстом — подпись остаётся читаемой, даже если её
 * пересекает линия графика или сетка. */
export const halo = { paintOrder: "stroke" as const, stroke: "#fff", strokeWidth: 3, strokeLinejoin: "round" as const };

/** "x1" → "x₁": подписи точек на оси в задачах №8 пишутся с индексами. */
export function subscriptDigits(s: string) {
  const map = "₀₁₂₃₄₅₆₇₈₉";
  return s.replace(/^([a-zA-Z])(\d+)$/, (_, l: string, d: string) => l + d.replace(/\d/g, (c) => map[Number(c)]));
}

/** Подпись значения (число / "?") у середины отрезка p1–p2, вынесенная
 * по нормали на off пикселей в сторону от точки away (обычно центр фигуры). */
export function segLabelPos(p1: Pt, p2: Pt, away: Pt, off = 13): Pt {
  const mx = (p1.x + p2.x) / 2;
  const my = (p1.y + p2.y) / 2;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len;
  let ny = dx / len;
  if ((mx - away.x) * nx + (my - away.y) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { x: mx + nx * off, y: my + ny * off + 5 };
}

export function ValueLabel({ x, y, value, anchor = "middle" }: { x: number; y: number; value: string; anchor?: "start" | "middle" | "end" }) {
  return (
    <text x={x} y={y} textAnchor={anchor} style={{ ...(isUnknown(value) ? unknownStyle : givenStyle), ...halo }}>
      {value}
    </text>
  );
}

/** Маркер прямого угла в вершине v между направлениями на p1 и p2. */
export function rightAnglePath(v: Pt, p1: Pt, p2: Pt, size = 11) {
  const u = (p: Pt) => {
    const l = Math.hypot(p.x - v.x, p.y - v.y) || 1;
    return { x: (p.x - v.x) / l, y: (p.y - v.y) / l };
  };
  const a = u(p1);
  const b = u(p2);
  const q1 = { x: v.x + a.x * size, y: v.y + a.y * size };
  const q2 = { x: q1.x + b.x * size, y: q1.y + b.y * size };
  const q3 = { x: v.x + b.x * size, y: v.y + b.y * size };
  return `M ${q1.x} ${q1.y} L ${q2.x} ${q2.y} L ${q3.x} ${q3.y}`;
}
