"use client";

import { useState } from "react";
import { PublicProblem, TheoryCard } from "@/lib/types";
import { ProblemState } from "@/lib/queries";
import ProblemCard from "./ProblemCard";
import TheoryCards from "./TheoryCards";
import ComboBadge from "./ComboBadge";
import CompletionCelebration from "./CompletionCelebration";
import { IconBook } from "./icons";

export default function LessonFlow({
  skillTitle,
  theoryCards,
  problems,
  initialStates,
  nextHref,
  nextLabel,
  isLastSkill,
}: {
  skillTitle: string;
  theoryCards: TheoryCard[];
  problems: PublicProblem[];
  initialStates: Record<string, ProblemState>;
  nextHref: string;
  nextLabel: string;
  isLastSkill: boolean;
}) {
  const allSolvedInitially = problems.every((p) => initialStates[p.id]?.status === "solved");
  const [phase, setPhase] = useState<"theory" | "problems">(
    theoryCards.length > 0 && !allSolvedInitially ? "theory" : "problems"
  );
  const [theoryOverlay, setTheoryOverlay] = useState(false);
  const [index, setIndex] = useState(0);
  const [states, setStates] = useState(initialStates);
  const [combo, setCombo] = useState(0);
  const [hadMistake, setHadMistake] = useState(false);
  const [wasAlreadyComplete] = useState(allSolvedInitially);
  const [showCelebration, setShowCelebration] = useState(false);

  const solvedCount = Object.values(states).filter((s) => s.status === "solved").length;

  function handleSolved(problemId: string) {
    setStates((prev) => ({ ...prev, [problemId]: { status: "solved" } }));
    setCombo((c) => c + 1);
    const newSolvedCount = Object.values({ ...states, [problemId]: { status: "solved" as const } }).filter(
      (s) => s.status === "solved"
    ).length;
    if (!wasAlreadyComplete && newSolvedCount === problems.length) {
      setTimeout(() => setShowCelebration(true), 500);
    }
  }

  function handleWrong() {
    setCombo(0);
    setHadMistake(true);
  }

  if (phase === "theory") {
    return (
      <TheoryCards
        cards={theoryCards}
        completeLabel="Начать задачи →"
        onComplete={() => setPhase("problems")}
      />
    );
  }

  const current = problems[index];
  const currentState = states[current.id] ?? { status: "unsolved" };

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {problems.map((p, i) => {
            const st = states[p.id]?.status;
            return (
              <button
                key={p.id}
                onClick={() => setIndex(i)}
                className={`h-2.5 rounded-pill transition-all ${
                  i === index
                    ? "w-7 bg-pine"
                    : st === "solved"
                      ? "w-2.5 bg-pine/50"
                      : "w-2.5 bg-line hover:bg-pine/30"
                }`}
                aria-label={`Задача ${i + 1}`}
              />
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <ComboBadge combo={combo} />
          {theoryCards.length > 0 && (
            <button
              onClick={() => setTheoryOverlay(true)}
              className="flex items-center gap-1.5 rounded-pill border-2 border-line px-3 py-1.5 text-xs font-extrabold text-ink-soft transition hover:border-pine hover:text-pine"
            >
              <IconBook className="h-3.5 w-3.5" />
              Теория
            </button>
          )}
        </div>
      </div>

      <p className="mb-3 text-xs font-extrabold uppercase tracking-wide text-ink-soft">
        Задача {index + 1} из {problems.length} · решено {solvedCount}/{problems.length}
      </p>

      <ProblemCard
        key={current.id}
        problem={current}
        status={currentState.status}
        solvedInfo={currentState.solvedInfo}
        feedback={currentState.feedback}
        previousAnswer={currentState.previousAnswer}
        source="lesson"
        onSolved={() => handleSolved(current.id)}
        onWrong={handleWrong}
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
          onClick={() => setIndex((i) => Math.min(problems.length - 1, i + 1))}
          disabled={index === problems.length - 1}
          className="btn-secondary flex-1 disabled:opacity-30"
        >
          Далее →
        </button>
      </div>

      {theoryOverlay && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 px-4 backdrop-blur-sm">
          <TheoryCards
            cards={theoryCards}
            completeLabel="Вернуться к задаче"
            onComplete={() => setTheoryOverlay(false)}
            onClose={() => setTheoryOverlay(false)}
          />
        </div>
      )}

      {showCelebration && (
        <CompletionCelebration
          subtopicTitle={skillTitle}
          xpEarned={problems.length * 10}
          bonusXp={!hadMistake ? 30 : 0}
          nextHref={nextHref}
          nextLabel={nextLabel}
          isLastSubtopic={isLastSkill}
        />
      )}
    </div>
  );
}
