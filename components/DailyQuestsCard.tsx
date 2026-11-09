import type { DailyQuests } from "@/lib/daily-quests";
import QuestRewardBurst from "./QuestRewardBurst";

const ICON: Record<string, string> = { solve: "🎯", combo: "🔥", new: "✨", fix: "💪", review: "🧠" };

/**
 * «Задания дня» (lib/daily-quests.ts): три небольшие цели, за все три —
 * заморозка серии. Без таймеров и штрафов: не успел — завтра будут новые.
 */
export default function DailyQuestsCard({ data, compact = false }: { data: DailyQuests; compact?: boolean }) {
  const doneCount = data.quests.filter((q) => q.done).length;
  return (
    <section
      aria-label="Задания дня"
      className={`rounded-[20px] border p-4 ${data.allDone ? "border-amber/40 bg-amber-light/60" : "border-line-soft bg-white"}`}
    >
      {data.justRewarded && <QuestRewardBurst />}
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-[16px] font-black text-ink">Задания дня</h2>
        <span className="text-[12px] font-bold text-ink-soft">
          {data.allDone ? "все выполнены 🏆" : `${doneCount} из ${data.quests.length}`}
        </span>
      </div>
      <ul className={`mt-3 ${compact ? "space-y-2.5" : "space-y-3"}`}>
        {data.quests.map((q) => (
          <li key={q.kind} className="flex items-center gap-3">
            <span
              aria-hidden
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[17px] ${q.done ? "bg-pine-light" : "bg-grid"}`}
            >
              {q.done ? "✅" : ICON[q.kind]}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className={`truncate text-[14px] font-extrabold ${q.done ? "text-ink-soft line-through decoration-2" : "text-ink"}`}>
                  {q.title}
                </p>
                <span className="shrink-0 text-[12px] font-bold text-ink-soft">
                  {q.progress}/{q.target}
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-pill bg-grid">
                <div
                  className={`h-full rounded-pill transition-all ${q.done ? "bg-pine" : "bg-amber"}`}
                  style={{ width: `${Math.round((q.progress / q.target) * 100)}%` }}
                />
              </div>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[12px] font-semibold text-ink-soft">
        {data.allDone
          ? data.freezeGiven || !data.justRewarded
            ? "Готово! За все три задания — заморозка серии ❄️. Завтра будут новые."
            : "Готово! Запас заморозок полный — завтра будут новые задания."
          : "Выполни все три — получишь заморозку серии ❄️"}
      </p>
    </section>
  );
}
