"use client";

import { useState, useTransition, useRef } from "react";
import { submitAttemptAction, revealSolutionAction } from "@/app/actions";
import { PublicProblem, SolvedInfo } from "@/lib/types";
import { IconLightbulb, IconBook, IconCheck, IconClipboard } from "./icons";
import DiagramRenderer from "./diagrams/DiagramRenderer";
import DiagramScratchpad from "./diagrams/DiagramScratchpad";
import MathKeyboard from "./MathKeyboard";
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
  onOpenTheory,
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
  /** Кнопка "Теория" в панели инструментов — опциональна: есть только там,
   * где родитель (LessonFlow) реально владеет карточками теории навыка. */
  onOpenTheory?: () => void;
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
  const [formulaOpen, setFormulaOpen] = useState(false);
  const [scratchpadOpen, setScratchpadOpen] = useState(false);
  const [hasSketch, setHasSketch] = useState(false);
  const [noEnergy, setNoEnergy] = useState(false);
  const [selfChecked, setSelfChecked] = useState(false);
  const [pending, startTransition] = useTransition();
  const answerInputRef = useRef<HTMLInputElement>(null);

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
      {/* Панель инструментов: ЕГЭ-чип слева, Формула/Теория справа —
          обе открывают шпаргалку оверлеем, не уводя со задачи. */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {problem.egeTaskNumber && (
            <span className="rounded-pill bg-amber-light px-2.5 py-1 text-[11px] font-extrabold text-amber-text">
              ЕГЭ №{problem.egeTaskNumber}
            </span>
          )}
          {isDetailed && (
            <span className="flex items-center gap-1 rounded-pill bg-violet-light px-2.5 py-1 text-[11px] font-extrabold text-violet-text">
              <IconClipboard className="h-3 w-3" />
              Развёрнутое решение
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {problem.keyFormula && (
            <button
              type="button"
              onClick={() => setFormulaOpen(true)}
              className="rounded-pill border-2 border-line px-3 py-1.5 text-xs font-extrabold text-ink-soft transition hover:border-pine hover:text-pine"
            >
              Формула
            </button>
          )}
          {onOpenTheory && (
            <button
              type="button"
              onClick={onOpenTheory}
              className="rounded-pill border-2 border-line px-3 py-1.5 text-xs font-extrabold text-ink-soft transition hover:border-pine hover:text-pine"
            >
              Теория
            </button>
          )}
        </div>
      </div>

      {(solved || pendingReview) && (
        <div className="mb-3">
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
        </div>
      )}

      {/* Формула — оверлей поверх задачи, а не разворачивание внутри карточки */}
      {formulaOpen && problem.keyFormula && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-sm sm:items-center"
          onClick={() => setFormulaOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-t-3xl bg-white p-6 shadow-soft sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center gap-3">
              <Mascot mood="hint" size={48} float={false} />
              <p className="font-display text-lg font-black text-ink">Формула-подсказка</p>
            </div>
            <p className="rounded-2xl bg-pine-light px-4 py-3 font-mono text-base font-bold text-pine-dark">
              {problem.keyFormula}
            </p>
            <button onClick={() => setFormulaOpen(false)} className="btn-primary mt-5 w-full">
              Понятно
            </button>
          </div>
        </div>
      )}

      {/* Диаграмма — тап открывает черновик для пометок */}
      {problem.diagram && (
        <>
          <button
            type="button"
            aria-label="Открыть черновик для пометок на диаграмме"
            onClick={() => setScratchpadOpen(true)}
            className="group relative mb-1.5 block h-44 w-full rounded-2xl border border-line-soft bg-paper p-2 text-left transition hover:border-pine"
          >
            <DiagramRenderer spec={problem.diagram} />
            <span className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full border border-line bg-white text-sm shadow-soft transition group-active:scale-90">
              ✏️
            </span>
            {hasSketch && (
              <span className="absolute left-2.5 top-2.5 rounded-pill bg-pine px-2 py-0.5 text-[10px] font-extrabold text-white">
                есть пометки
              </span>
            )}
          </button>
          <p className="mb-4 text-[11px] font-bold text-ink-soft">
            Нажми на чертёж, чтобы чертить и помечать
          </p>
          {scratchpadOpen && (
            <DiagramScratchpad
              spec={problem.diagram}
              onClose={() => setScratchpadOpen(false)}
              onDirty={() => setHasSketch(true)}
            />
          )}
        </>
      )}

      <p className="mb-4 text-[16px] font-semibold leading-relaxed text-ink" style={{ textWrap: "pretty" as any }}>
        {problem.text}
      </p>

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
        <form onSubmit={handleSubmit} className="space-y-3">
          {isDetailed ? (
            <textarea
              className="input min-h-[140px] resize-y font-sans text-[15px]"
              placeholder="Опишите решение подробно: что дано, какие теоремы/формулы применяете, промежуточные шаги, ответ."
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              disabled={pending}
            />
          ) : (
            <>
              <div
                className={`flex items-center justify-between rounded-2xl border-2 bg-white px-4 py-3 transition ${
                  wrongState ? "border-coral" : "border-pine"
                } ${shakeSeq > 0 ? "animate-shake" : ""}`}
                key={shakeSeq}
              >
                <input
                  ref={answerInputRef}
                  className="w-full bg-transparent font-mono text-[20px] font-black text-ink outline-none placeholder:text-ink-soft/50"
                  placeholder="Ответ"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  disabled={pending}
                  autoFocus={shakeSeq > 0}
                />
              </div>
              <MathKeyboard inputRef={answerInputRef} onInsert={setAnswer} />
            </>
          )}
          <button
            className="btn-primary !h-14 w-full !text-base"
            type="submit"
            disabled={pending}
          >
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
