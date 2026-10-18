import { D, halo, isUnknown, givenStyle, unknownStyle } from "./shared";

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
 * r, h — числа из условия: высота рисунка следует отношению h/r (в
 * разумных пределах 0.45…2), иначе плоский конус выглядел бы высоким и
 * наоборот. hLabel / rLabel / dLabel / slantLabel — подписи высоты,
 * радиуса, диаметра основания и образующей (число или "?").
 *
 * `section` — необязательное сечение через вершину: треугольник SAB, где
 * A и B — точки на окружности основания (заданы углами).
 */
export default function ConeDiagram({
  showHeight = true,
  section,
  r,
  h,
  hLabel,
  rLabel,
  dLabel,
  slantLabel,
}: {
  showHeight?: boolean;
  section?: ConeSection;
  r?: number;
  h?: number;
  hLabel?: string;
  rLabel?: string;
  dLabel?: string;
  slantLabel?: string;
}) {
  const cx = 150;
  const ratio = r && h ? Math.min(2, Math.max(0.45, h / r)) : 1.86;
  // Высота картинки ограничена (~140px): для высоких конусов уменьшаем
  // радиус, для плоских — увеличиваем, чтобы фигура занимала холст.
  const rx = Math.min(105, 135 / ratio);
  const ry = Math.max(12, rx * 0.24);
  const heightPx = rx * ratio;
  const baseY = Math.min(160, 30 + heightPx + (140 - heightPx) / 2);
  const apex = { x: cx, y: baseY - heightPx };

  const pointOnBase = (angleDeg: number) => {
    const t = (angleDeg * Math.PI) / 180;
    return { x: cx + rx * Math.cos(t), y: baseY + ry * Math.sin(t) };
  };

  const valueStyle = (v: string) => ({ ...(isUnknown(v) ? unknownStyle : givenStyle), ...halo });

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

      {(dLabel || rLabel) && (
        <line
          x1={dLabel ? cx - rx : cx}
          y1={baseY}
          x2={cx + rx}
          y2={baseY}
          stroke={D.inkSoft}
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
      )}

      {showHeight && (
        <>
          <line x1={apex.x} y1={apex.y} x2={cx} y2={baseY} stroke={D.inkSoft} strokeWidth="1.5" strokeDasharray="3 3" />
          {heightPx > 40 && (
            <path d={`M ${cx} ${baseY - 9} h 9 v 9`} fill="none" stroke={D.inkSoft} strokeWidth="1.2" />
          )}
          <circle cx={cx} cy={baseY} r="2.5" fill={D.inkSoft} />
          <text x={cx - 8} y={baseY + 15} textAnchor="end" fontSize="13" fontWeight="800" fontStyle="italic" fill={D.ink}>
            O
          </text>
        </>
      )}
      <text x={apex.x} y={apex.y - 8} textAnchor="middle" fontSize="13" fontWeight="800" fontStyle="italic" fill={D.ink}>
        S
      </text>

      {hLabel && (
        <text x={cx - 7} y={(apex.y + baseY) / 2 + 5} textAnchor="end" style={valueStyle(hLabel)}>
          {hLabel}
        </text>
      )}
      {rLabel && !dLabel && (
        <text x={cx + rx / 2} y={baseY - 5} textAnchor="middle" style={valueStyle(rLabel)}>
          {rLabel}
        </text>
      )}
      {dLabel && (
        <text x={cx + rx / 2} y={baseY - 5} textAnchor="middle" style={valueStyle(dLabel)}>
          {dLabel}
        </text>
      )}
      {slantLabel && (
        <text
          x={(apex.x + cx + rx) / 2 + 10}
          y={(apex.y + baseY) / 2}
          textAnchor="start"
          style={valueStyle(slantLabel)}
        >
          {slantLabel}
        </text>
      )}

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
              x={A.x + (A.x < cx ? -6 : 6)}
              y={A.y + 15}
              textAnchor={A.x < cx ? "end" : "start"}
              fontSize="13"
              fontWeight="800"
              fontStyle="italic"
              fill={D.ink}
            >
              {section.labelA}
            </text>
            <text
              x={B.x + (B.x < cx ? -6 : 6)}
              y={B.y + 15}
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
