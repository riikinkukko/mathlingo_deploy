import { IconCheck, IconLock } from "./icons";

export interface HorizontalPathItem {
  id: string;
  title: string;
  state: "done" | "current" | "locked";
  problemsCount: number;
  solvedCount: number;
}

export default function HorizontalSkillPath({ skills }: { skills: HorizontalPathItem[] }) {
  return (
    <div className="flex items-start overflow-x-auto pb-1">
      {skills.map((s, i) => {
        const isDone = s.state === "done";
        const isCurrent = s.state === "current";
        const isLast = i === skills.length - 1;

        const circle = (
          <span
            className={`flex shrink-0 items-center justify-center rounded-full font-display font-black ${
              isCurrent
                ? "h-14 w-14 border-4 border-pine bg-white text-pine-dark"
                : isDone
                  ? "h-11 w-11 bg-pine text-white"
                  : "h-11 w-11 bg-grid text-ink-soft"
            }`}
          >
            {isDone ? (
              <IconCheck className="h-5 w-5" />
            ) : isCurrent ? (
              <span className="text-sm">
                {s.solvedCount}/{s.problemsCount}
              </span>
            ) : (
              <span className="text-base">{i + 1}</span>
            )}
          </span>
        );

        const node = (
          <div className="flex w-24 shrink-0 flex-col items-center text-center">
            {circle}
            <p
              className={`mt-2 line-clamp-2 text-[12px] leading-tight ${
                isCurrent ? "font-black text-ink" : "font-bold text-ink-soft"
              }`}
            >
              {s.title}
            </p>
            {isCurrent && <p className="mt-0.5 text-[10.5px] font-extrabold text-pine">СЕЙЧАС</p>}
          </div>
        );

        return (
          <div key={s.id} className="flex items-start">
            {s.state === "locked" ? (
              <div className="pt-0 opacity-75">{node}</div>
            ) : (
              <a href={`/student/skill/${s.id}`} className="pt-0 transition hover:opacity-80">
                {node}
              </a>
            )}
            {!isLast && (
              <div className={`mt-5 h-1 w-8 shrink-0 rounded-pill ${isDone ? "bg-pine" : "bg-grid"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
