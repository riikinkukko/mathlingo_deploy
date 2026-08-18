"use client";

import { useState } from "react";
import { PublicProblem } from "@/lib/types";
import { ProblemState } from "@/lib/queries";
import ProblemCard from "./ProblemCard";
import ComboBadge from "./ComboBadge";
import CompletionCelebration from "./CompletionCelebration";
import CountdownTimer from "./CountdownTimer";

const KIND_LABEL: Record<string, string> = {
  homework: "Домашка выполнена",
  test: "Контрольная сдана",
  exam: "Пробник завершён",
};

export default function AssignmentFlow({
  title,
  kind,
  allowHints,
  items,
  initialStates,
  deadlineAt,
}: {
  title: string;
  kind: string;
  allowHints: boolean;
  items: { problem: PublicProblem; skillTitle: string }[];
  initialStates: Record<string, ProblemState>;
  deadlineAt?: string | null;
}) {
  const [index, setIndex] = useState(0);
  const [states, setStates] = useState(initialStates);
  const [combo, setCombo] = useState(0);
  const [wasAlreadyComplete] = useState(
    items.every((it) => initialStates[it.problem.id]?.status === "solved")
  );
  const [showCelebration, setShowCelebration] = useState(false);
  const [expired, setExpired] = useState(false);

  const solvedCount = Object.values(states).filter((s) => s.status === "solved").length;

  function handleSolved(problemId: string) {
    setStates((prev) => ({ ...prev, [problemId]: { status: "solved" } }));
    setCombo((c) => c + 1);
    const newCount = Object.values({ ...states, [problemId]: { status: "solved" as const } }).filter(
      (s) => s.status === "solved"
    ).length;
    if (!wasAlreadyComplete && newCount === items.length) {
      setTimeout(() => setShowCelebration(true), 500);
    }
  }

  const current = items[index];
  const currentState = states[current.problem.id] ?? { status: "unsolved" };
  const stepPct = Math.round(((index + 1) / items.length) * 100);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-4 flex items-center gap-3">
        <a
          href="/student/homework"
          aria-label="Назад к списку заданий"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-white text-ink-soft transition hover:border-pine hover:text-pine"
        >
          ←
        </a>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-[17px] font-black text-ink">{title}</h1>
          <p className="text-[12px] font-bold text-ink-soft">
            Задача {index + 1} из {items.length} · решено {solvedCount}/{items.length}
          </p>
        </div>
      </div>
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-pill bg-grid">
        <div className="h-full rounded-pill bg-amber transition-all" style={{ width: `${stepPct}%` }} />
      </div>

      {deadlineAt && !expired && (
        <div className="mb-4 flex justify-end">
          <CountdownTimer deadlineAt={deadlineAt} onExpire={() => setExpired(true)} />
        </div>
      )}
      {expired && (
        <div className="mb-4 rounded-2xl border-2 border-coral-light bg-coral-light p-3.5 text-sm font-bold text-coral">
          ⏱ Время вышло. Дальше отвечать нельзя — но уже решённые задачи и разбор остаются доступны.
        </div>
      )}

      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {items.map((it, i) => {
            const st = states[it.problem.id]?.status;
            return (
              <button
                key={it.problem.id}
                onClick={() => setIndex(i)}
                className={`h-2.5 rounded-pill transition-all ${
                  i === index ? "w-7 bg-pine" : st === "solved" ? "w-2.5 bg-pine/50" : "w-2.5 bg-line hover:bg-pine/30"
                }`}
                aria-label={`Задача ${i + 1}`}
              />
            );
          })}
        </div>
        <ComboBadge combo={combo} />
      </div>

      <p className="mb-4 text-[11px] font-bold text-ink-soft">Из навыка «{current.skillTitle}»</p>

      <ProblemCard
        key={current.problem.id}
        problem={current.problem}
        status={currentState.status}
        solvedInfo={currentState.solvedInfo}
        feedback={currentState.feedback}
        previousAnswer={currentState.previousAnswer}
        allowHints={allowHints}
        source="assignment"
        locked={expired}
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
          subtopicTitle={title}
          xpEarned={50}
          nextHref="/student/homework"
          nextLabel="К заданиям"
          eyebrow={KIND_LABEL[kind] ?? "Задание выполнено"}
        />
      )}
    </div>
  );
}
