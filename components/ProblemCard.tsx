"use client";

import { useState, useTransition } from "react";
import { submitAttemptAction, revealSolutionAction } from "@/app/actions";
import { PublicProblem, SolvedInfo } from "@/lib/types";
import { IconLightbulb, IconBook, IconCheck, IconClipboard } from "./icons";
import DiagramRenderer from "./diagrams/DiagramRenderer";
import DiagramScratchpad from "./diagrams/DiagramScratchpad";
import Mascot from "./Mascot";

type WrongState = { hint: string; wrongCount: number; canRevealSolution: boolean };
export type ProblemCardStatus = "unsolved" | "solved" | "pending" | "needs_revision";

export default function ProblemCard({
  problem,
  status,
  solvedInfo,
  feedback,
  previousAnswer,
  allowHints = true,
  source,
  locked = false,
  onSolved,
  onWrong,
}: {
  problem: PublicProblem;
  status: ProblemCardStatus;
  solvedInfo?: SolvedInfo | null;
  feedback?: string;
  previousAnswer?: string;
  allowHints?: boolean;
  source: "lesson" | "assignment" | "review";
  locked?: boolean;
  onSolved?: () => void;
  onWrong?: () => void;
}) {
  const isDetailed = problem.answerType === "DETAILED";
  const [answer, setAnswer] = useState(previousAnswer ?? "");
  const [correctResult, setCorrectResult] = useState<SolvedInfo | null>(
    status === "solved" ? solvedInfo ?? null : null
  );
  const [wrongState, setWrongState] = useState<WrongState | null>(null);
  const [solution, setSolution] = useState<SolvedInfo | null>(null);
  const [solved, setSolved] = useState(status === "solved");
  const [pendingReview, setPendingReview] = useState(status === "pending");
  const [needsRevision, setNeedsRevision] = useState(status === "needs_revision");
  const [justSolved, setJustSolved] = useState(false);
  const [shakeSeq, setShakeSeq] = useState(0);
  const [showFormula, setShowFormula] = useState(false);
  const [scratchpadOpen, setScratchpadOpen] = useState(false);
  const [noEnergy, setNoEnergy] = useState(false);
  const [selfChecked, setSelfChecked] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim()) return;
    startTransition(async () => {
      const res = await submitAttemptAction(problem.id, answer, source);
      if ("error" in res) return;

      if (res.kind === "no_energy") {
        setNoEnergy(true);
        return;
      }
      if (res.kind === "pending") {
        setPendingReview(true);
        setNeedsRevision(false);
        return;
      }
      if (res.kind === "correct") {
        setCorrectResult({ explanation: res.explanation, correctAnswer: res.correctAnswer });
        setWrongState(null);
        if ("selfChecked" in res && res.selfChecked) setSelfChecked(true);
        const wasAlreadySolved = solved;
        setSolved(true);
        if (!wasAlreadySolved) {
          setJustSolved(true);
          onSolved?.();
        }
        return;
      }
      // wrong
      setWrongState({ hint: res.hint, wrongCount: res.wrongCount, canRevealSolution: res.canRevealSolution });
      setShakeSeq((n) => n + 1);
      onWrong?.();
    });
  }

  function handleReveal() {
    startTransition(async () => {
      const res = await revealSolutionAction(problem.id);
      if ("error" in res) return;
      setSolution(res);
    });
  }

  const showForm = !solved && !pendingReview && !locked && !noEnergy;

  return (
    <div className={`card p-5 sm:p-6 ${solved ? "border-pine-light bg-pine-light/30" : ""}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {problem.egeTaskNumber && (
            <span className="rounded-pill bg-amber-light px-2.5 py-1 text-[11px] font-extrabold text-amber">
              ЕГЭ №{problem.egeTaskNumber}
            </span>
          )}
          {isDetailed && (
            <span className="flex items-center gap-1 rounded-pill bg-violet-light px-2.5 py-1 text-[11px] font-extrabold text-violet">
              <IconClipboard className="h-3 w-3" />
              Развёрнутое решение
            </span>
          )}
          {problem.keyFormula && (
            <button
              type="button"
              onClick={() => setShowFormula((v) => !v)}
              className="flex items-center gap-1 rounded-pill border-2 border-line px-2.5 py-1 text-[11px] font-extrabold text-ink-soft transition hover:border-pine hover:text-pine"
            >
              📐 {showFormula ? "Скрыть формулу" : "Формула"}
            </button>
          )}
        </div>
        {solved && (
          <span className="rounded-pill bg-pine px-2.5 py-1 text-[11px] font-extrabold text-white">
            Решено ✓
          </span>
        )}
        {pendingReview && (
          <span className="rounded-pill bg-amber px-2.5 py-1 text-[11px] font-extrabold text-white">
            На проверке
          </span>
        )}
        {showForm && (
          <Mascot mood="idle" size={40} interactive float={false} className="shrink-0" />
        )}
      </div>

      {showFormula && problem.keyFormula && (
        <div className="mb-4 flex animate-slide-up-fade items-center gap-2.5 rounded-xl bg-pine-light px-4 py-2.5">
          <Mascot mood="hint" size={36} float={false} className="shrink-0" />
          <span className="font-mono text-sm font-bold text-pine-dark">{problem.keyFormula}</span>
        </div>
      )}

      {problem.diagram && (
        <>
          <button
            type="button"
            aria-label="Открыть черновик для пометок на диаграмме"
            onClick={() => setScratchpadOpen(true)}
            className="group relative mb-4 block h-44 w-full rounded-2xl bg-pine-light/25 p-2 text-left"
          >
            <DiagramRenderer spec={problem.diagram} />
            <span className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-sm shadow-soft transition group-active:scale-90">
              ✏️
            </span>
          </button>
          {scratchpadOpen && (
            <DiagramScratchpad spec={problem.diagram} onClose={() => setScratchpadOpen(false)} />
          )}
        </>
      )}

      <p className="mb-4 text-[16px] font-semibold leading-relaxed text-ink">{problem.text}</p>

      {needsRevision && feedback && !pendingReview && (
        <div className="mb-4 rounded-2xl border-2 border-coral-light bg-coral-light p-3.5 text-sm">
          <p className="mb-1 font-extrabold text-coral">Преподаватель просит доработать:</p>
          <p className="text-ink-soft">{feedback}</p>
        </div>
      )}

      {pendingReview && (
        <div className="rounded-2xl border-2 border-amber-light bg-amber-light p-4 text-sm">
          <p className="mb-2 font-extrabold text-amber">Решение отправлено на проверку</p>
          <p className="whitespace-pre-wrap text-ink-soft">{answer}</p>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-2.5">
          {isDetailed ? (
            <textarea
              className="input min-h-[140px] resize-y font-sans text-[15px]"
              placeholder="Опишите решение подробно: что дано, какие теоремы/формулы применяете, промежуточные шаги, ответ."
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              disabled={pending}
            />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <input
                key={shakeSeq}
                className={`input !w-40 font-mono font-bold ${
                  shakeSeq > 0 ? "animate-shake" : ""
                } ${wrongState ? "border-coral" : ""}`}
                placeholder="Ответ"
                defaultValue={answer}
                onChange={(e) => setAnswer(e.target.value)}
                disabled={pending}
                autoFocus={shakeSeq > 0}
              />
            </div>
          )}
          <button className="btn-primary" type="submit" disabled={pending}>
            {pending ? "Отправляем…" : isDetailed ? "Отправить на проверку" : "Проверить"}
          </button>
        </form>
      )}

      {locked && !solved && !pendingReview && (
        <p className="rounded-2xl border-2 border-line bg-paper px-4 py-3 text-sm font-bold text-ink-soft">
          ⏱ Время вышло — эта задача осталась без ответа.
        </p>
      )}

      {noEnergy && (
        <div className="rounded-2xl border-2 border-amber-light bg-amber-light p-4">
          <p className="mb-1 font-extrabold text-amber">⚡ Энергия закончилась</p>
          <p className="mb-3 text-sm text-ink-soft">
            На бесплатном плане ограниченное число новых задач в день. Энергия
            восстанавливается со временем, или переходи на Pro — там она безлимитна.
          </p>
          <a href="/student/upgrade" className="btn-primary !text-xs">
            Узнать про Pro
          </a>
        </div>
      )}

      {wrongState && !correctResult && (
        <div className="mt-4 flex animate-slide-up-fade items-start gap-2.5 rounded-2xl border-2 border-amber-light bg-amber-light p-3.5 text-sm leading-relaxed">
          {allowHints && <Mascot mood="thinking" size={40} float={false} className="mt-0.5 shrink-0" />}
          <div className="min-w-0 flex-1">
          {allowHints ? (
            <>
              <p className="mb-1 flex items-center gap-1.5 font-extrabold text-amber">
                <IconLightbulb className="h-4 w-4 shrink-0" />
                Пока не то. Подсказка:
              </p>
              <p className="text-ink-soft">{wrongState.hint}</p>

              {solution ? (
                <div className="mt-3 rounded-xl border border-line bg-white p-3">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-extrabold text-ink">
                    <IconBook className="h-3.5 w-3.5" />
                    Решение
                  </p>
                  <p className="text-ink-soft">{solution.explanation}</p>
                </div>
              ) : (
                wrongState.canRevealSolution && (
                  <button
                    onClick={handleReveal}
                    disabled={pending}
                    className="mt-2 flex items-center gap-1.5 text-xs font-extrabold text-ink-soft underline underline-offset-2 hover:text-ink"
                  >
                    <IconBook className="h-3.5 w-3.5" />
                    Показать решение
                  </button>
                )
              )}
            </>
          ) : (
            <p className="font-extrabold text-amber">
              Неверно. Это контрольный режим — подсказки и разбор недоступны, попробуйте ещё раз.
            </p>
          )}
          </div>
        </div>
      )}
      {correctResult && (
        <div className="relative mt-4 flex animate-slide-up-fade items-start gap-2.5 overflow-visible rounded-2xl border-2 border-pine-light bg-pine-light p-3.5 text-sm leading-relaxed text-pine-dark">
          <div className="pointer-events-none absolute inset-0 animate-flash rounded-2xl" />
          {justSolved && (
            <Mascot mood="love" size={40} float={false} className="mt-0.5 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="mb-1 flex items-center gap-1.5 font-extrabold">
              <IconCheck className="h-4 w-4 shrink-0" />
              {selfChecked
                ? "Решение принято — сверьтесь с эталоном ниже"
                : isDetailed
                  ? "Преподаватель проверил — верно!"
                  : "Верно!"}
              {justSolved && (
                <span className="pointer-events-none absolute right-3 top-2 animate-xp-float font-display text-sm font-black text-amber">
                  +10 XP
                </span>
              )}
            </p>
            <p className="relative text-ink-soft">{correctResult.explanation}</p>
          </div>
        </div>
      )}
    </div>
  );
}
