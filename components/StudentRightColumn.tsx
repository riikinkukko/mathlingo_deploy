import Mascot from "./Mascot";
import { LevelInfo, WeakSkillEntry } from "@/lib/queries";

export default function StudentRightColumn({
  level,
  nextLevelTitle,
  weekActivity,
  weakSkills,
  tip,
}: {
  level: LevelInfo;
  nextLevelTitle: string | null;
  weekActivity: { label: string; done: boolean; isToday: boolean }[];
  weakSkills: WeakSkillEntry[];
  tip: string;
}) {
  const streakDays = weekActivity.filter((d) => d.done).length;

  return (
    <aside className="hidden w-[300px] shrink-0 space-y-4 lg:block">
      <div className="card p-4">
        <p className="text-[11px] font-black uppercase tracking-wide text-ink-soft">Звание</p>
        <p className="mt-1 font-display text-lg font-black text-ink">{level.title}</p>
        <div className="mt-2.5 h-2 w-full overflow-hidden rounded-pill bg-grid">
          <div
            className="h-full rounded-pill bg-gradient-to-r from-teal to-pine"
            style={{ width: `${level.progressPct}%` }}
          />
        </div>
        <p className="mt-1.5 text-[11px] text-ink-soft">
          {level.xp}
          {level.nextLevelMinXp !== null ? ` / ${level.nextLevelMinXp} XP` : " XP · максимум"}
          {nextLevelTitle && ` · ещё ${level.nextLevelMinXp! - level.xp} до «${nextLevelTitle}»`}
        </p>
      </div>

      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[11px] font-black uppercase tracking-wide text-ink-soft">Неделя</p>
          <p className="text-[11px] font-extrabold text-pine">{streakDays} дней подряд</p>
        </div>
        <div className="flex gap-1.5">
          {weekActivity.map((d) => (
            <div key={d.label} className="flex flex-1 flex-col items-center gap-1.5">
              <div
                className={`h-9 w-full rounded-lg ${
                  d.done ? "bg-pine" : d.isToday ? "bg-pine-mint" : "bg-grid"
                }`}
              />
              <span className="text-[9.5px] font-bold text-ink-soft">{d.label}</span>
            </div>
          ))}
        </div>
      </div>

      {weakSkills.length > 0 && (
        <div className="card p-4">
          <p className="mb-3 text-[11px] font-black uppercase tracking-wide text-ink-soft">
            Требует внимания
          </p>
          <div className="space-y-3">
            {weakSkills.map((s) => (
              <div key={s.skillId}>
                <div className="mb-1 flex items-center justify-between">
                  <p className="truncate text-[13px] font-extrabold text-ink">{s.skillTitle}</p>
                  <span className="shrink-0 text-[12px] font-black text-coral">{s.accuracy}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-pill bg-grid">
                  <div
                    className="h-full rounded-pill bg-gradient-to-r from-coral to-amber"
                    style={{ width: `${s.accuracy}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-ink-soft">
                  {s.wrongCount} {s.wrongCount === 1 ? "ошибка" : "ошибок"} из {s.totalAttempts}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card flex items-start gap-2.5 p-4">
        <Mascot mood="hint" size={40} interactive float={false} className="shrink-0" />
        <p className="text-[13px] leading-snug text-ink-soft">
          <span className="font-extrabold text-ink">Гео: </span>
          {tip}
        </p>
      </div>
    </aside>
  );
}
