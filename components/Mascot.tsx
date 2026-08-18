"use client";

import { useState, useEffect } from "react";

export type MascotMood =
  | "idle"
  | "happy"
  | "celebrating"
  | "thinking"
  | "sleepy"
  | "worried"
  | "surprised"
  | "wink"
  | "love"
  | "hint";

// Палитра из брендбука «Гео» — держимся её буквально, а не палитры
// приложения (они близки, но это принципиально ЕГО цвета).
const C = {
  body: "#22C55E",
  bodyLight: "#6EE7B7",
  face: "#EFFFF7",
  dark: "#0F5132",
  white: "#FFFFFF",
};

interface MoodConfig {
  eyes: "open" | "closed" | "wink" | "heart" | "wide" | "happy";
  mouth: "smile" | "big" | "o" | "flat" | "frown";
  arms: "down" | "up" | "wave" | "chin" | "point";
  extra?: "sparkles" | "zzz" | "bulb" | "exclaim" | "hearts";
}

const MOODS: Record<MascotMood, MoodConfig> = {
  idle: { eyes: "open", mouth: "smile", arms: "down" },
  happy: { eyes: "happy", mouth: "big", arms: "wave" },
  celebrating: { eyes: "happy", mouth: "big", arms: "up", extra: "sparkles" },
  thinking: { eyes: "open", mouth: "flat", arms: "chin" },
  sleepy: { eyes: "closed", mouth: "flat", arms: "down", extra: "zzz" },
  worried: { eyes: "open", mouth: "frown", arms: "down" },
  surprised: { eyes: "wide", mouth: "o", arms: "down", extra: "exclaim" },
  wink: { eyes: "wink", mouth: "smile", arms: "wave" },
  love: { eyes: "heart", mouth: "big", arms: "down", extra: "hearts" },
  hint: { eyes: "open", mouth: "smile", arms: "point", extra: "bulb" },
};

const PHRASES = [
  "Геометрия — это не страшно, это красиво!",
  "Ты справишься, я в тебя верю 💚",
  "Каждая решённая задача — это +1 к уверенности на экзамене.",
  "Застрял? Открой теорию — там есть подсказка.",
  "Ошибка — это просто способ узнать что-то новое.",
  "Продолжай в том же духе!",
  "Треугольники — моя любимая тема. А твоя?",
  "Маленькими шагами к большому результату.",
];

function Eye({ cx, state, size = 1 }: { cx: number; state: MoodConfig["eyes"]; size?: number }) {
  const r = 7 * size;
  if (state === "closed" || state === "wink") {
    return (
      <path
        d={`M ${cx - r} 53 Q ${cx} ${53 + r * 0.9} ${cx + r} 53`}
        fill="none"
        stroke={C.dark}
        strokeWidth={2.6}
        strokeLinecap="round"
      />
    );
  }
  if (state === "heart") {
    return (
      <path
        transform={`translate(${cx - 8} 44) scale(0.75)`}
        d="M11 20 C4 14 0 10 0 6 C0 2.5 2.7 0 6 0 C8 0 10 1.3 11 3 C12 1.3 14 0 16 0 C19.3 0 22 2.5 22 6 C22 10 18 14 11 20 Z"
        fill="#EF4444"
      />
    );
  }
  const rr = state === "wide" ? r * 1.25 : r;
  return (
    <g className="mascot-blink" style={{ transformOrigin: `${cx}px 52px` }}>
      <circle cx={cx} cy={52} r={rr + 2.5} fill={C.white} />
      <g className="geo-pupil">
        <circle cx={cx} cy={52} r={rr} fill={C.dark} />
        <circle cx={cx - rr * 0.35} cy={52 - rr * 0.35} r={rr * 0.32} fill={C.white} />
      </g>
    </g>
  );
}

function Mouth({ state }: { state: MoodConfig["mouth"] }) {
  const d = {
    smile: "M 50 68 Q 60 75 70 68",
    big: "M 47 66 Q 60 82 73 66 Q 60 78 47 66 Z",
    o: "M 60 65 a 6 7 0 1 0 0.1 0",
    flat: "M 52 70 Q 60 70 68 70",
    frown: "M 50 74 Q 60 66 70 74",
  }[state];
  const fill = state === "big" || state === "o" ? C.dark : "none";
  return <path d={d} fill={fill} stroke={C.dark} strokeWidth={2.4} strokeLinecap="round" />;
}

export default function Mascot({
  mood = "idle",
  size = 96,
  className = "",
  interactive = false,
  float = true,
}: {
  mood?: MascotMood;
  size?: number;
  className?: string;
  /** Кликабельный режим — тап показывает случайную реплику в облачке. */
  interactive?: boolean;
  /** Плавное покачивание (дыхание + лёгкий bob). */
  float?: boolean;
}) {
  const cfg = MOODS[mood];
  const [phrase, setPhrase] = useState<string | null>(null);
  const [blinkNow, setBlinkNow] = useState(false);

  // Случайное моргание — не по идеальному таймеру, а с разбросом, чтобы
  // выглядело органично, а не механически.
  useEffect(() => {
    if (cfg.eyes !== "open" && cfg.eyes !== "wide") return;
    let cancelled = false;
    function scheduleBlink() {
      const delay = 2200 + Math.random() * 2600;
      window.setTimeout(() => {
        if (cancelled) return;
        setBlinkNow(true);
        window.setTimeout(() => !cancelled && setBlinkNow(false), 160);
        scheduleBlink();
      }, delay);
    }
    scheduleBlink();
    return () => {
      cancelled = true;
    };
  }, [cfg.eyes]);

  function handleClick() {
    if (!interactive) return;
    setPhrase(PHRASES[Math.floor(Math.random() * PHRASES.length)]);
    window.setTimeout(() => setPhrase(null), 3200);
  }

  const armUp = cfg.arms === "up";
  const armWave = cfg.arms === "wave";
  const armChin = cfg.arms === "chin";
  const armPoint = cfg.arms === "point";

  return (
    <div className={`relative inline-block ${className}`} style={{ width: size, height: size }}>
      <style>{`
        @keyframes geo-breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.025); } }
        @keyframes geo-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        @keyframes geo-blink-scale { 0%,100% { transform: scaleY(1); } 50% { transform: scaleY(0.12); } }
        @keyframes geo-orbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes geo-wave { 0%,100% { transform: rotate(-8deg); } 50% { transform: rotate(22deg); } }
        @keyframes geo-armsup { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-2px) rotate(4deg); } }
        @keyframes geo-sparkle { 0%,100% { opacity: 0.25; transform: scale(0.7); } 50% { opacity: 1; transform: scale(1.15); } }
        @keyframes geo-pupil { 0%,100% { transform: translate(0,0); } 38% { transform: translate(2px,1px); } 70% { transform: translate(-2px,-1px); } }
        @keyframes geo-bulb { 0%,100% { opacity: 0.55; transform: scale(0.92); } 50% { opacity: 1; transform: scale(1.08); } }
        @keyframes geo-pop { 0% { transform: scale(0.7) rotate(-4deg); opacity: 0; } 60% { transform: scale(1.08) rotate(2deg); opacity: 1; } 100% { transform: scale(1) rotate(0deg); opacity: 1; } }
        .geo-pop { animation: geo-pop 0.5s cubic-bezier(.34,1.56,.64,1); }
        .geo-float { animation: geo-bob 2.8s ease-in-out infinite; }
        .geo-breathe { animation: geo-breathe 3.4s ease-in-out infinite; transform-origin: 60px 75px; }
        .geo-blinking { animation: geo-blink-scale 0.16s ease-in-out; }
        .geo-orbit-group { animation: geo-orbit 16s linear infinite; transform-origin: 60px 68px; }
        .geo-wave-arm { animation: geo-wave 1.1s ease-in-out infinite; transform-origin: 26px 78px; }
        .geo-up-arm-l { animation: geo-armsup 0.8s ease-in-out infinite; transform-origin: 22px 82px; }
        .geo-up-arm-r { animation: geo-armsup 0.8s ease-in-out infinite 0.15s; transform-origin: 98px 82px; }
        .geo-sparkle { animation: geo-sparkle 1.3s ease-in-out infinite; }
        .geo-pupil { animation: geo-pupil 4s ease-in-out infinite; }
        .geo-bulb { animation: geo-bulb 1.5s ease-in-out infinite; transform-origin: 90px 14px; }
        @media (prefers-reduced-motion: reduce) {
          .geo-float, .geo-breathe, .geo-orbit-group, .geo-pupil { animation: none !important; }
        }
      `}</style>

      {phrase && (
        <div className="absolute left-0 top-full z-20 mt-2 w-48 animate-scale-in rounded-2xl bg-white px-3.5 py-2.5 text-center text-xs font-bold text-ink shadow-soft">
          <span className="absolute bottom-full left-4 h-3 w-3 -translate-y-1.5 rotate-45 bg-white" />
          {phrase}
        </div>
      )}

      <div
        key={mood}
        onClick={handleClick}
        className={`geo-pop h-full w-full ${float ? "geo-float" : ""} ${
          interactive ? "cursor-pointer active:scale-90" : ""
        } transition-transform`}
      >
        <svg viewBox="0 0 120 132" className="h-full w-full overflow-visible select-none">
          {/* тень-гало под ногами — намёк на парение */}
          <ellipse cx="60" cy="120" rx="24" ry="5.5" fill={C.body} opacity="0.22" />

          {/* орбитирующие геометрические спутники */}
          <g className="geo-orbit-group">
            <rect x="93" y="18" width="10" height="10" rx="2.5" fill={C.bodyLight} transform="rotate(18 98 23)" />
            <circle cx="14" cy="40" r="5" fill={C.bodyLight} />
            <polygon points="60,4 66,15 54,15" fill={C.bodyLight} />
          </g>

          <g className="geo-breathe">
            {/* тело */}
            <path
              d="M60 24
                 C86 24 100 42 100 68
                 C100 96 84 114 60 114
                 C36 114 20 96 20 68
                 C20 42 34 24 60 24 Z"
              fill={C.body}
              stroke={C.dark}
              strokeWidth="3"
              strokeLinejoin="round"
            />

            {/* левая рука */}
            <g className={armWave ? "geo-wave-arm" : armUp ? "geo-up-arm-l" : ""}>
              {armChin ? (
                <path d="M26 84 Q8 72 24 58 Q34 50 43 64" fill="none" stroke={C.body} strokeWidth="10" strokeLinecap="round" />
              ) : armUp ? (
                <path d="M26 84 Q10 76 12 54" fill="none" stroke={C.body} strokeWidth="10" strokeLinecap="round" />
              ) : (
                <path d="M24 80 Q14 88 18 100" fill="none" stroke={C.body} strokeWidth="10" strokeLinecap="round" />
              )}
            </g>

            {/* правая рука */}
            <g className={armUp ? "geo-up-arm-r" : ""}>
              {armPoint ? (
                <path d="M96 82 Q112 74 110 56" fill="none" stroke={C.body} strokeWidth="10" strokeLinecap="round" />
              ) : armUp ? (
                <path d="M94 84 Q110 76 108 54" fill="none" stroke={C.body} strokeWidth="10" strokeLinecap="round" />
              ) : (
                <path d="M96 80 Q106 88 102 100" fill="none" stroke={C.body} strokeWidth="10" strokeLinecap="round" />
              )}
            </g>
            {armPoint && <circle cx="110" cy="54" r="4.5" fill={C.dark} />}

            {/* лицо */}
            <ellipse cx="60" cy="58" rx="34" ry="32" fill={C.face} />

            <g className={blinkNow ? "geo-blinking" : ""} style={{ transformOrigin: "60px 52px" }}>
              <Eye cx={46} state={cfg.eyes === "wink" ? "open" : cfg.eyes} />
              <Eye cx={74} state={cfg.eyes} />
            </g>
            <Mouth state={cfg.mouth} />

            {/* значок-бейдж с пи на животе */}
            <circle cx="60" cy="97" r="12" fill={C.dark} />
            <text x="60" y="102" textAnchor="middle" fontSize="14" fontWeight="700" fill={C.white} fontFamily="Georgia, serif">
              π
            </text>
          </g>

          {/* доп. элементы по настроению */}
          {cfg.extra === "sparkles" && (
            <>
              <path className="geo-sparkle" d="M20 20 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z" fill={C.bodyLight} />
              <path
                className="geo-sparkle"
                style={{ animationDelay: "0.4s" }}
                d="M104 30 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6 Z"
                fill={C.bodyLight}
              />
              <circle className="geo-sparkle" style={{ animationDelay: "0.7s" }} cx="14" cy="70" r="3" fill={C.bodyLight} />
            </>
          )}
          {cfg.extra === "zzz" && (
            <text x="88" y="30" fontSize="16" fontWeight="800" fill={C.dark} opacity="0.75" fontFamily="sans-serif">
              z z
            </text>
          )}
          {cfg.extra === "exclaim" && (
            <text x="94" y="34" fontSize="24" fontWeight="900" fill={C.dark} fontFamily="sans-serif">
              !
            </text>
          )}
          {cfg.extra === "bulb" && (
            <g className="geo-bulb" transform="translate(90,14)">
              <circle cx="0" cy="0" r="9" fill="#FDE68A" stroke="#F59E0B" strokeWidth="1.5" />
              <rect x="-3" y="8" width="6" height="4" rx="1" fill="#9CA3AF" />
            </g>
          )}
          {cfg.extra === "hearts" && (
            <>
              <path
                className="geo-sparkle"
                transform="translate(16,26) scale(0.5)"
                d="M11 20 C4 14 0 10 0 6 C0 2.5 2.7 0 6 0 C8 0 10 1.3 11 3 C12 1.3 14 0 16 0 C19.3 0 22 2.5 22 6 C22 10 18 14 11 20 Z"
                fill="#F87171"
              />
              <path
                className="geo-sparkle"
                style={{ animationDelay: "0.5s" }}
                transform="translate(96,20) scale(0.4)"
                d="M11 20 C4 14 0 10 0 6 C0 2.5 2.7 0 6 0 C8 0 10 1.3 11 3 C12 1.3 14 0 16 0 C19.3 0 22 2.5 22 6 C22 10 18 14 11 20 Z"
                fill="#F87171"
              />
            </>
          )}
        </svg>
      </div>
    </div>
  );
}
