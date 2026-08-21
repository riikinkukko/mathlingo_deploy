import { D } from "./shared";

/**
 * Цилиндр: два эллипса (проекция окружностей оснований) соединённые
 * вертикальными образующими. Задняя дуга нижнего эллипса — пунктиром
 * (скрыта телом цилиндра), это стандартный способ рисовать круглые тела.
 */
export default function CylinderDiagram() {
  const cx = 150;
  const rx = 70;
  const ry = 18;
  const topY = 40;
  const botY = 160;

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
    </svg>
  );
}
