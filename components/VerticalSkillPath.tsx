import { IconCheck, IconLock } from "./icons";

export interface VerticalPathItem {
  id: string;
  title: string;
  state: "done" | "current" | "locked";
  problemsCount: number;
  factsCount: number;
  solvedCount: number;
}

export default function VerticalSkillPath({ skills }: { skills: VerticalPathItem[] }) {
  const currentIdx = skills.findIndex((s) => s.state === "current");

  return (
    <div className="space-y-0">
      {skills.map((s, i) => {
        const isDone = s.state === "done";
        const isCurrent = s.state === "current";
        // "Доступный" — визуальный анонс следующего шага сразу после текущего
        // (полное описание вместо "Откроется после X"), но НЕ кликабелен —
        // кликается только текущий навык. Держим принцип "ровно одно
        // очевидное следующее действие", просто даём заглянуть вперёд.
        const isNextPreview = s.state === "locked" && currentIdx >= 0 && i === currentIdx + 1;
        const prevTitle = i > 0 ? skills[i - 1].title : null;
        const connectorDone = isDone || isCurrent;

        const circle = (
          <span
            className={`relative z-10 flex shrink-0 items-center justify-center rounded-full ${
              isCurrent
                ? "h-12 w-12 border-4 border-pine bg-white"
                : isDone
                  ? "h-11 w-11 bg-pine text-white"
                  : "h-11 w-11 bg-grid text-ink-soft"
            }`}
          >
            {isDone ? (
              <IconCheck className="h-5 w-5" />
            ) : isCurrent ? (
              <span className="font-display text-sm font-black text-pine-dark">
                {s.solvedCount}/{s.problemsCount}
              </span>
            ) : isNextPreview ? (
              <span className="font-display text-base font-black">{i + 1}</span>
            ) : (
              <IconLock className="h-4 w-4" />
            )}
          </span>
        );

        const content = (
          <div className="min-w-0 flex-1 py-0.5">
            <p
              className={`${
                isCurrent
                  ? "font-display text-[15.5px] font-black text-ink"
                  : isDone
                    ? "text-[14px] font-bold text-ink-soft"
                    : isNextPreview
                      ? "text-[14px] font-extrabold text-ink"
                      : "text-[14px] font-extrabold text-ink-soft"
              }`}
            >
              {s.title}
            </p>
            {isCurrent && (
              <p className="mt-0.5 text-[12px] font-extrabold text-pine">
                СЕЙЧАС · {s.problemsCount - s.solvedCount}{" "}
                {s.problemsCount - s.solvedCount === 1 ? "задача осталась" : "задач осталось"}
              </p>
            )}
            {isNextPreview && (
              <p className="mt-0.5 text-[12px] text-ink-soft">
                {s.problemsCount} задач · {s.factsCount} карточки теории
              </p>
            )}
            {s.state === "locked" && !isNextPreview && (
              <p className="mt-0.5 text-[12px] text-ink-soft">
                {prevTitle ? `Откроется после «${prevTitle}»` : "Пока закрыто"}
              </p>
            )}
          </div>
        );

        const row = (
          <div className={`flex items-start gap-3.5 ${s.state === "locked" && !isNextPreview ? "opacity-75" : ""}`}>
            <div className="flex flex-col items-center">
              {circle}
              {i < skills.length - 1 && (
                <span
                  className={`my-0.5 h-4 w-1 rounded-pill ${connectorDone ? "bg-pine" : "bg-grid"}`}
                />
              )}
            </div>
            {content}
          </div>
        );

        if (isCurrent) {
          return (
            <a
              key={s.id}
              href={`/student/skill/${s.id}`}
              className="mb-1 block rounded-[18px] border-2 border-pine bg-white p-3.5 shadow-[0_6px_18px_-12px_rgba(19,42,32,0.4)]"
            >
              {row}
            </a>
          );
        }
        if (isDone) {
          return (
            <a key={s.id} href={`/student/skill/${s.id}`} className="block py-1">
              {row}
            </a>
          );
        }
        return (
          <div key={s.id} className="py-1">
            {row}
          </div>
        );
      })}
    </div>
  );
}
