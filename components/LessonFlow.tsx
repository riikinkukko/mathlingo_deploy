"use client";

import { useState } from "react";
import { PublicProblem, TheoryCard } from "@/lib/types";
import { ProblemState } from "@/lib/queries";
import ProblemCard from "./ProblemCard";
import TheoryCards from "./TheoryCards";
import ComboBadge from "./ComboBadge";
import CompletionCelebration from "./CompletionCelebration";

export default function LessonFlow({
  skillTitle,
  theoryCards,
  problems,
  initialStates,
  nextHref,
  nextLabel,
  isLastSkill,
  forceTheoryFirst = false,
  backHref = "/student",
}: {
  skillTitle: string;
  theoryCards: TheoryCard[];
  problems: PublicProblem[];
  initialStates: Record<string, ProblemState>;
  nextHref: string;
  nextLabel: string;
  isLastSkill: boolean;
  /** Показать теорию ПЕРЕД задачами, а не по кнопке — используется только
   * для самого первого навыка, с которого ученик заходит в совершенно
   * новую для себя тему (см. app/student/skill/[id]/page.tsx). */
  forceTheoryFirst?: boolean;
  /** Куда ведёт стрелка "←" наверху — по умолчанию общий дашборд без
   * контекста темы, но обычно родитель передаёт "/student?topic=<id>",
   * чтобы ученик вернулся в ТУ ЖЕ тему, где решал задачу, а не всегда
   * в первую тему списка (см. app/student/skill/[id]/page.tsx). */
  backHref?: string;
}) {
  const allSolvedInitially = problems.every((p) => initialStates[p.id]?.status === "solved");
  // Если карточек теории нет вообще — показывать нечего, сразу к задачам,
  // даже если forceTheoryFirst=true (пустой экран теории хуже, чем никакой).
  const [phase, setPhase] = useState<"theory" | "problems">(
    forceTheoryFirst && theoryCards.length > 0 ? "theory" : "problems"
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

  const current = problems[index];
  const currentState = states[current.id] ?? { status: "unsolved" };
  const stepPct = Math.round(((index + 1) / problems.length) * 100);

  // Первое знакомство с совсем новой темой — теория идёт ПЕРЕД задачами, а
  // не по кнопке. Тот же компонент TheoryCards, что и в оверлее по кнопке
  // ниже — просто другая точка входа и другой текст на кнопке завершения.
  if (phase === "theory") {
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
            <h1 className="truncate font-display text-[17px] font-black text-ink">{skillTitle}</h1>
            <p className="text-[12px] font-bold text-ink-soft">Сначала — коротко о теме</p>
          </div>
        </div>
        <TheoryCards
          cards={theoryCards}
          completeLabel="Начать задачи →"
          onComplete={() => setPhase("problems")}
        />
      </div>
    );
  }

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
          <h1 className="truncate font-display text-[17px] font-black text-ink">{skillTitle}</h1>
          <p className="text-[12px] font-bold text-ink-soft">
            Задача {index + 1} из {problems.length}
            {current.egeTaskNumber ? ` · ЕГЭ №${current.egeTaskNumber}` : ""}
          </p>
        </div>
      </div>
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-pill bg-grid">
        <div className="h-full rounded-pill bg-pine transition-all" style={{ width: `${stepPct}%` }} />
      </div>

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
        </div>
      </div>

      <p className="mb-3 text-xs font-extrabold uppercase tracking-wide text-ink-soft">
        Решено {solvedCount}/{problems.length}
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
        onOpenTheory={theoryCards.length > 0 ? () => setTheoryOverlay(true) : undefined}
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
