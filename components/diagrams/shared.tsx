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
