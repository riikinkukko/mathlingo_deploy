import { IconCheck, IconLock, IconStar } from "./icons";
import Mascot from "./Mascot";

export interface VerticalPathItem {
  id: string;
  title: string;
  state: "done" | "current" | "locked";
  problemsCount: number;
  factsCount: number;
  solvedCount: number;
}

// Смещение кружков влево-вправо от центра — «змейка», как в Duolingo.
const OFFSETS = [0, 52, 78, 52, 0, -52, -78, -52];

/**
 * Путь главы на телефоне: кружки-уроки змейкой, Гео рядом с текущим уроком.
 * Кликаются пройденные (повторить) и текущий; закрытые — нет. Следующий
 * после текущего показывает номер вместо замка — видно, что ждёт дальше.
 */
export default function VerticalSkillPath({ skills }: { skills: VerticalPathItem[] }) {
  const currentIdx = skills.findIndex((s) => s.state === "current");

  return (
    <ol className="relative flex flex-col items-center gap-3 py-2">
      {skills.map((s, i) => {
        const isDone = s.state === "done";
        const isCurrent = s.state === "current";
        const isNextPreview = s.state === "locked" && currentIdx >= 0 && i === currentIdx + 1;
        const offset = OFFSETS[i % OFFSETS.length];
        const left = s.problemsCount - s.solvedCount;

        const node = (
          <span
            className={`relative flex items-center justify-center rounded-full transition active:translate-y-1 ${
              isCurrent
                ? "h-[76px] w-[76px] bg-pine text-white shadow-[0_6px_0_#12583A]"
                : isDone
                  ? "h-[68px] w-[68px] bg-pine text-white shadow-[0_5px_0_#12583A]"
                  : "h-[68px] w-[68px] bg-grid text-ink-soft shadow-[0_5px_0_#C9DED2]"
            }`}
          >
            {isCurrent && (
              // Кольцо прогресса текущего урока: сколько задач уже решено.
              <span
                aria-hidden
                className="absolute -inset-[7px] rounded-full"
                style={{
                  background: `conic-gradient(#1CAE6B 0 ${Math.round((s.solvedCount / Math.max(1, s.problemsCount)) * 100)}%, #DCEEE3 0 100%)`,
                  WebkitMask: "radial-gradient(circle, transparent 41px, #000 42px)",
                  mask: "radial-gradient(circle, transparent 41px, #000 42px)",
                }}
              />
            )}
            {isDone ? (
              <IconCheck className="h-8 w-8" />
            ) : isCurrent ? (
              <IconStar className="h-8 w-8" />
            ) : isNextPreview ? (
              <span className="font-display text-xl font-black">{i + 1}</span>
            ) : (
              <IconLock className="h-6 w-6" />
            )}
          </span>
        );

        const label = (
          <span
            className={`mt-2 block max-w-[170px] text-center text-[13px] leading-tight ${
              isCurrent ? "font-black text-ink" : isDone ? "font-bold text-ink-soft" : "font-bold text-ink-soft/80"
            }`}
          >
            {s.title}
          </span>
        );

        const ariaLabel = isCurrent
          ? `${s.title} — сейчас, осталось ${left}`
          : isDone
            ? `${s.title} — пройден, повторить`
            : `${s.title} — закрыт`;

        return (
          <li key={s.id} className="relative flex flex-col items-center" style={{ transform: `translateX(${offset}px)` }}>
            {isCurrent && (
              // Гео стоит с той стороны, где больше места, и подсказывает, что делать.
              <div
                className={`pointer-events-none absolute top-0 flex flex-col items-center ${
                  offset >= 0 ? "right-full mr-3" : "left-full ml-3"
                }`}
              >
                <span className="mb-1 whitespace-nowrap rounded-xl bg-ink px-2.5 py-1 text-[12px] font-extrabold text-white">
                  {s.solvedCount === 0 ? "Начнём!" : `Ещё ${left}!`}
                </span>
                <Mascot mood="happy" size={64} float={false} />
              </div>
            )}
            {isCurrent || isDone ? (
              <a href={`/student/skill/${s.id}`} aria-label={ariaLabel} className="flex flex-col items-center">
                {node}
                {label}
              </a>
            ) : (
              <div aria-label={ariaLabel} className="flex flex-col items-center">
                {node}
                {label}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
