import { D } from "./shared";

export interface CylinderPoint {
  /** Угол точки на окружности, градусы: 0 = справа, 90 = ближе к зрителю. */
  angle: number;
  label: string;
  base: "bottom" | "top";
}

/**
 * Цилиндр: два эллипса (проекция окружностей оснований) соединённые
 * вертикальными образующими. Задняя дуга нижнего эллипса — пунктиром
 * (скрыта телом цилиндра), это стандартный способ рисовать круглые тела.
 *
 * `points` — именованные точки на верхней/нижней окружности (заданы
 * углами), `segments` — янтарные отрезки между парами точек по их
 * подписям (например, скрещивающиеся прямые в задаче).
 */
export default function CylinderDiagram({
  points,
  segments,
}: {
  points?: CylinderPoint[];
  segments?: [string, string][];
}) {
  const cx = 150;
  const rx = 70;
  const ry = 18;
  const topY = 40;
  const botY = 160;

  const pointOn = (angleDeg: number, base: "bottom" | "top") => {
    const t = (angleDeg * Math.PI) / 180;
    const y = base === "bottom" ? botY : topY;
    return { x: cx + rx * Math.cos(t), y: y + ry * Math.sin(t) };
  };

  const byLabel = new Map<string, { x: number; y: number }>();
  // Центры оснований подписаны на чертеже как O (низ) и O₁ (верх) — регистрируем
  // их тоже, чтобы segments мог провести отрезок к центру по этим именам.
  byLabel.set("O", { x: cx, y: botY });
  byLabel.set("O1", { x: cx, y: topY });
  (points ?? []).forEach((p) => byLabel.set(p.label, pointOn(p.angle, p.base)));

  return (
    <svg viewBox="0 0 300 200" className="h-full w-full">
      {/* боковая поверхность — заливка между эллипсами */}
      <rect x={cx - rx} y={topY} width={rx * 2} height={botY - topY} fill={D.pineLight} fillOpacity="0.5" />

      {/* нижний эллипс: видимая передняя дуга сплошная, задняя — пунктир */}
      <path
        d={`M ${cx - rx} ${botY} A ${rx} ${ry} 0 0 0 ${cx + rx} ${botY}`}
        fill="none"
        stroke={D.inkSoft}
        strokeWidth="1.5"
        strokeDasharray="4 3"
      />
      <path
        d={`M ${cx - rx} ${botY} A ${rx} ${ry} 0 0 1 ${cx + rx} ${botY}`}
        fill="none"
        stroke={D.ink}
        strokeWidth="2"
      />

      {/* верхний эллипс — целиком виден */}
      <ellipse cx={cx} cy={topY} rx={rx} ry={ry} fill={D.pineLight} fillOpacity="0.7" stroke={D.ink} strokeWidth="2" />

      {/* образующие по бокам */}
      <line x1={cx - rx} y1={topY} x2={cx - rx} y2={botY} stroke={D.ink} strokeWidth="2" />
      <line x1={cx + rx} y1={topY} x2={cx + rx} y2={botY} stroke={D.ink} strokeWidth="2" />

      {/* ось — пунктир по центру, с точками O (низ) и O1 (верх) */}
      <line x1={cx} y1={topY} x2={cx} y2={botY} stroke={D.inkSoft} strokeWidth="1.5" strokeDasharray="3 3" />
      <circle cx={cx} cy={topY} r="2.5" fill={D.inkSoft} />
      <circle cx={cx} cy={botY} r="2.5" fill={D.inkSoft} />
      <text x={cx + 10} y={topY + 4} fontSize="13" fontWeight="800" fontStyle="italic" fill={D.ink}>
        O₁
      </text>
      <text x={cx + 10} y={botY - 2} fontSize="13" fontWeight="800" fontStyle="italic" fill={D.ink}>
        O
      </text>

      {(segments ?? []).map(([from, to], i) => {
        const a = byLabel.get(from);
        const b = byLabel.get(to);
        if (!a || !b) return null;
        return (
          <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={D.amber} strokeWidth="2.5" />
        );
      })}

      {(points ?? []).map((p, i) => {
        const pt = pointOn(p.angle, p.base);
        // Точки рядом с центром эллипса (например, перпендикуляр к диаметру)
        // визуально сливаются с подписью O/O₁ — если точка не у самого края
        // эллипса по горизонтали, подпись уводим вниз, подальше от центра.
        const nearCenterX = Math.abs(pt.x - cx) < rx * 0.4;
        const labelBelow = p.base === "bottom" || (p.base === "top" && nearCenterX);
        return (
          <g key={i}>
            <circle cx={pt.x} cy={pt.y} r="3" fill={D.amber} />
            <text
              x={nearCenterX ? pt.x : pt.x + (pt.x < cx ? -9 : 9)}
              y={pt.y + (labelBelow ? 16 : -8)}
              textAnchor={nearCenterX ? "middle" : pt.x < cx ? "end" : "start"}
              fontSize="13"
              fontWeight="800"
              fontStyle="italic"
              fill={D.ink}
            >
              {p.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
