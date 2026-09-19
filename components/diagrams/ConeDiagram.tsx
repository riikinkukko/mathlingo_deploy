import { D } from "./shared";

interface ConeSection {
  /** Угол точки на окружности основания, градусы: 0 = справа, 90 = ближе к зрителю (передняя дуга). */
  angleA: number;
  angleB: number;
  labelA: string;
  labelB: string;
}

/**
 * Конус: эллипс основания (передняя дуга сплошная, задняя — пунктир, как
 * у цилиндра) + вершина сверху, соединённая с краями эллипса образующими,
 * и пунктирная высота от вершины до центра основания.
 *
 * `section` — необязательное осевое сечение: треугольник SAB, где A и B —
 * точки на окружности основания (заданы углами), закрашен полупрозрачным
 * янтарным цветом поверх остального чертежа, чтобы визуально выделяться.
 */
export default function ConeDiagram({
  showHeight = true,
  section,
}: {
  showHeight?: boolean;
  section?: ConeSection;
}) {
  const cx = 150;
  const rx = 70;
  const ry = 18;
  const baseY = 160;
  const apex = { x: cx, y: 30 };

  const pointOnBase = (angleDeg: number) => {
    const t = (angleDeg * Math.PI) / 180;
    return { x: cx + rx * Math.cos(t), y: baseY + ry * Math.sin(t) };
  };

  return (
    <svg viewBox="0 0 300 200" className="h-full w-full">
      <polygon
        points={`${apex.x},${apex.y} ${cx - rx},${baseY} ${cx + rx},${baseY}`}
        fill={D.pineLight}
        fillOpacity="0.4"
      />

      <path
        d={`M ${cx - rx} ${baseY} A ${rx} ${ry} 0 0 0 ${cx + rx} ${baseY}`}
        fill="none"
        stroke={D.inkSoft}
        strokeWidth="1.5"
        strokeDasharray="4 3"
      />
      <path
        d={`M ${cx - rx} ${baseY} A ${rx} ${ry} 0 0 1 ${cx + rx} ${baseY}`}
        fill="none"
        stroke={D.ink}
        strokeWidth="2"
      />

      <line x1={apex.x} y1={apex.y} x2={cx - rx} y2={baseY} stroke={D.ink} strokeWidth="2" />
      <line x1={apex.x} y1={apex.y} x2={cx + rx} y2={baseY} stroke={D.ink} strokeWidth="2" />

      {showHeight && (
        <>
          <line x1={apex.x} y1={apex.y} x2={cx} y2={baseY} stroke={D.inkSoft} strokeWidth="1.5" strokeDasharray="3 3" />
          <circle cx={cx} cy={baseY} r="2.5" fill={D.inkSoft} />
          <text x={cx + 8} y={baseY - 2} fontSize="13" fontWeight="800" fontStyle="italic" fill={D.ink}>
            O
          </text>
        </>
      )}
      <text x={apex.x} y={apex.y - 10} textAnchor="middle" fontSize="13" fontWeight="800" fontStyle="italic" fill={D.ink}>
        S
      </text>

      {section && (() => {
        const A = pointOnBase(section.angleA);
        const B = pointOnBase(section.angleB);
        return (
          <>
            <polygon
              points={`${apex.x},${apex.y} ${A.x},${A.y} ${B.x},${B.y}`}
              fill={D.amber}
              fillOpacity="0.35"
              stroke={D.amber}
              strokeWidth="2"
            />
            <circle cx={A.x} cy={A.y} r="2.5" fill={D.amber} />
            <circle cx={B.x} cy={B.y} r="2.5" fill={D.amber} />
            <text
              x={A.x + (A.x < cx ? -10 : 10)}
              y={A.y + 4}
              textAnchor={A.x < cx ? "end" : "start"}
              fontSize="13"
              fontWeight="800"
              fontStyle="italic"
              fill={D.ink}
            >
              {section.labelA}
            </text>
            <text
              x={B.x + (B.x < cx ? -10 : 10)}
              y={B.y + 4}
              textAnchor={B.x < cx ? "end" : "start"}
              fontSize="13"
              fontWeight="800"
              fontStyle="italic"
              fill={D.ink}
            >
              {section.labelB}
            </text>
          </>
        );
      })()}
    </svg>
  );
}
