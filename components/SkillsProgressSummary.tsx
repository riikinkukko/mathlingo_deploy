"use client";

import { useState } from "react";
import FractionBadge from "./FractionBadge";

interface SkillProgress {
  solved: number;
  total: number;
  pct: number;
}

interface CurriculumEntry {
  topic: { id: string; title: string };
  chapters: {
    chapter: { id: string; title: string };
    skills: { id: string; title: string }[];
  }[];
}

/**
 * Раньше "Прогресс по навыкам" рендерил ПЛОСКИЙ список ВСЕХ навыков всех
 * тем сразу (при 73 навыках на 10 тем — экран без конца). Теперь: одна
 * строка на ТЕМУ с агрегированным прогрессом (видна общая динамика сразу,
 * без разворачивания), клик по теме показывает её навыки по главам.
 */
export default function SkillsProgressSummary({
  curriculum,
  progress,
}: {
  curriculum: CurriculumEntry[];
  progress: Record<string, SkillProgress>;
}) {
  const [openTopicId, setOpenTopicId] = useState<string | null>(null);

  const topicStats = curriculum.map((entry) => {
    const allSkills = entry.chapters.flatMap((c) => c.skills);
    const solved = allSkills.reduce((sum, s) => sum + (progress[s.id]?.solved ?? 0), 0);
    const total = allSkills.reduce((sum, s) => sum + (progress[s.id]?.total ?? 0), 0);
    const pct = total > 0 ? Math.round((solved / total) * 100) : 0;
    return { entry, solved, total, pct };
  });

  return (
    <div className="space-y-2">
      {topicStats.map(({ entry, solved, total, pct }) => {
        const isOpen = openTopicId === entry.topic.id;
        return (
          <div key={entry.topic.id} className="card overflow-hidden p-0">
            <button
              type="button"
              onClick={() => setOpenTopicId(isOpen ? null : entry.topic.id)}
              className="flex w-full items-center gap-4 p-3.5 text-left transition hover:bg-pine-light/40"
              aria-expanded={isOpen}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{entry.topic.title}</p>
              </div>
              <div className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-grid sm:w-40">
                <div className="h-full origin-left animate-grow-x bg-pine" style={{ width: `${pct}%` }} />
              </div>
              <FractionBadge solved={solved} total={total} size="sm" />
              <span className={`shrink-0 text-ink-soft transition-transform ${isOpen ? "rotate-90" : ""}`} aria-hidden>
                ›
              </span>
            </button>
            {isOpen && (
              <div className="space-y-3 border-t border-line bg-paper/60 p-3.5">
                {entry.chapters.map(({ chapter, skills }) => (
                  <div key={chapter.id}>
                    <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">
                      {chapter.title}
                    </p>
                    <div className="space-y-1.5">
                      {skills.map((skill) => {
                        const p = progress[skill.id] || { solved: 0, total: 0, pct: 0 };
                        return (
                          <div key={skill.id} className="flex items-center gap-3">
                            <p className="min-w-0 flex-1 truncate text-[13px] text-ink">{skill.title}</p>
                            <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-grid sm:w-28">
                              <div
                                className="h-full origin-left animate-grow-x bg-pine"
                                style={{ width: `${p.pct}%` }}
                              />
                            </div>
                            <FractionBadge solved={p.solved} total={p.total} size="sm" />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
