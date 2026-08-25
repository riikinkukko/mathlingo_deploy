"use client";

import { useState } from "react";
import { PublicProblem } from "@/lib/types";
import ProblemCard from "./ProblemCard";
import ComboBadge from "./ComboBadge";
import CompletionCelebration from "./CompletionCelebration";

export default function ReviewFlow({
  items,
  backHref = "/student",
}: {
  items: { problem: PublicProblem; skillTitle: string; box: number }[];
  /** Куда ведёт стрелка "←" — см. app/student/review/page.tsx: повторение
   * может смешивать задачи из разных тем, поэтому это либо тема, с
   * дашборда которой ученик открыл повторение, либо общий дашборд. */
  backHref?: string;
}) {
  const [index, setIndex] = useState(0);
  const [solvedIds, setSolvedIds] = useState<Set<string>>(new Set());
  const [combo, setCombo] = useState(0);
  const [showCelebration, setShowCelebration] = useState(false);

  function handleSolved(problemId: string) {
    setSolvedIds((prev) => {
      const next = new Set(prev).add(problemId);
      if (next.size === items.length) {
        setTimeout(() => setShowCelebration(true), 500);
      }
      return next;
    });
    setCombo((c) => c + 1);
  }

  const current = items[index];
  const solved = solvedIds.has(current.problem.id);
  const stepPct = Math.round(((index + 1) / items.length) * 100);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-4 flex items-center gap-3">
        <a
          href={backHref}
          aria-label="Назад к пути обучения"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-white text-ink-soft transition hover:border-pine hover:text-pine"
        >
          ←
        </a>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-[17px] font-black text-ink">Повторение</h1>
          <p className="text-[12px] font-bold text-ink-soft">
            Задача {index + 1} из {items.length} · решено {solvedIds.size}/{items.length}
          </p>
        </div>
      </div>
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-pill bg-grid">
        <div className="h-full rounded-pill bg-violet transition-all" style={{ width: `${stepPct}%` }} />
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {items.map((it, i) => {
            const st = solvedIds.has(it.problem.id);
            return (
              <button
                key={it.problem.id}
                onClick={() => setIndex(i)}
                className={`h-2.5 rounded-pill transition-all ${
                  i === index ? "w-7 bg-teal" : st ? "w-2.5 bg-teal/50" : "w-2.5 bg-line hover:bg-teal/30"
                }`}
                aria-label={`Задача ${i + 1}`}
              />
            );
          })}
        </div>
        <ComboBadge combo={combo} />
      </div>

      <p className="mb-4 text-[11px] font-bold text-ink-soft">
        Из навыка «{current.skillTitle}» · встречалась вам {current.box > 1 ? "уже несколько раз" : "недавно"}
      </p>

      <ProblemCard
        key={current.problem.id}
        problem={current.problem}
        status={solved ? "solved" : "unsolved"}
        allowHints
        source="review"
        onSolved={() => handleSolved(current.problem.id)}
        onWrong={() => setCombo(0)}
      />

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="btn-secondary flex-1 disabled:opacity-30"
        >
          ← Назад
        </button>
        <button
          onClick={() => setIndex((i) => Math.min(items.length - 1, i + 1))}
          disabled={index === items.length - 1}
          className="btn-secondary flex-1 disabled:opacity-30"
        >
          Далее →
        </button>
      </div>

      {showCelebration && (
        <CompletionCelebration
          subtopicTitle="Повторение пройдено"
          xpEarned={items.length * 10}
          nextHref={backHref}
          nextLabel="К пути обучения"
          eyebrow="Память укрепляется 🧠"
        />
      )}
    </div>
  );
}
