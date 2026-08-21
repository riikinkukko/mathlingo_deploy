import { D } from "./shared";

/**
 * Конус: эллипс основания (передняя дуга сплошная, задняя — пунктир, как
 * у цилиндра) + вершина сверху, соединённая с краями эллипса образующими,
 * и пунктирная высота от вершины до центра основания.
 */
export default function ConeDiagram({ showHeight = true }: { showHeight?: boolean }) {
  const cx = 150;
  const rx = 70;
  const ry = 18;
  const baseY = 160;
  const apex = { x: cx, y: 30 };

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
    </svg>
  );
}
