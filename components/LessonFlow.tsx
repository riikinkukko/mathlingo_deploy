"use client";

import { useState } from "react";
import { PublicProblem, TheoryCard } from "@/lib/types";
import { ProblemState } from "@/lib/queries";
import ProblemCard from "./ProblemCard";
import TheoryCards from "./TheoryCards";
import ComboBadge from "./ComboBadge";
import CompletionCelebration from "./CompletionCelebration";
import { IconClose } from "./icons";

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
  canAskTeacher = false,
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
  /** У ученика есть репетитор — показываем «Не понял — спросить репетитора». */
  canAskTeacher?: boolean;
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
  // Для итога урока: когда начали и в каких задачах ошибались.
  const [startedAt] = useState(() => Date.now());
  const [mistakeIds, setMistakeIds] = useState<Set<string>>(new Set());

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

  function handleWrong(problemId: string) {
    setCombo(0);
    setHadMistake(true);
    setMistakeIds((prev) => new Set(prev).add(problemId));
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
        <LessonTopBar backHref={backHref}>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[16px] font-black text-ink">{skillTitle}</p>
            <p className="text-[12px] font-bold text-ink-soft">Сначала — коротко о теме</p>
          </div>
        </LessonTopBar>
        <TheoryCards
          cards={theoryCards}
          completeLabel="Начать задачи →"
          onComplete={() => setPhase("problems")}
        />
      </div>
    );
  }

  const isLast = index === problems.length - 1;
  const canGoNext = currentState.status === "solved";

  return (
    <div className="mx-auto w-full max-w-2xl pb-28">
      {/* Верх урока: закрыть · один сегментированный прогресс · комбо.
          Раньше было три индикатора подряд (полоса, точки, «Решено 2/4»). */}
      <LessonTopBar backHref={backHref}>
        <div className="flex min-w-0 flex-1 gap-1.5" role="group" aria-label={`Решено ${solvedCount} из ${problems.length}`}>
          {problems.map((p, i) => {
            const st = states[p.id]?.status;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  // Назад — всегда; вперёд мимо задачи на проверке — нельзя.
                  if (i > index && currentState.status === "pending") return;
                  setIndex(i);
                }}
                aria-label={`Задача ${i + 1}${st === "solved" ? ", решена" : ""}`}
                aria-current={i === index ? "step" : undefined}
                className="flex h-11 flex-1 items-center"
              >
                <span
                  className={`block h-3 w-full rounded-pill transition-all ${
                    st === "solved" ? "bg-pine" : st === "pending" ? "bg-amber" : "bg-grid"
                  } ${i === index ? "ring-2 ring-pine-dark ring-offset-2 ring-offset-paper" : ""}`}
                />
              </button>
            );
          })}
        </div>
        <ComboBadge combo={combo} />
      </LessonTopBar>

      {/* Название навыка обрезается, а «N из M» видно всегда. */}
      <p className="mb-3 flex min-w-0 gap-1 text-[13px] font-bold text-ink-soft">
        <span className="truncate">{skillTitle}</span>
        <span className="shrink-0">· {index + 1} из {problems.length}</span>
      </p>

      <ProblemCard
        key={current.id}
        problem={current}
        status={currentState.status}
        solvedInfo={currentState.solvedInfo}
        feedback={currentState.feedback}
        previousAnswer={currentState.previousAnswer}
        review={currentState.review}
        source="lesson"
        onSolved={() => handleSolved(current.id)}
        onWrong={() => handleWrong(current.id)}
        onOpenTheory={theoryCards.length > 0 ? () => setTheoryOverlay(true) : undefined}
        canAskTeacher={canAskTeacher}
      />

      {/* Одна большая кнопка внизу, под большим пальцем: появляется, когда
          с задачей можно двигаться дальше. Вместо пары «← Назад / Далее →». */}
      {canGoNext && !showCelebration && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line-soft bg-white px-4 pb-[max(16px,var(--app-sab))] pt-3">
          <div className="mx-auto max-w-2xl">
            {isLast ? (
              solvedCount === problems.length ? (
                <a href={nextHref} className="btn-primary !h-14 w-full !text-base">
                  {nextLabel}
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => setIndex(problems.findIndex((p) => states[p.id]?.status !== "solved"))}
                  className="btn-primary !h-14 w-full !text-base"
                >
                  К нерешённой задаче
                </button>
              )
            ) : (
              <button type="button" onClick={() => setIndex(index + 1)} className="btn-primary !h-14 w-full !text-base">
                Дальше
              </button>
            )}
          </div>
        </div>
      )}

      {currentState.status === "pending" && (
        <p className="mt-2 text-center text-xs text-ink-soft">
          Решение отправлено репетитору на проверку — переход к следующей задаче
          откроется, как только он его посмотрит.
        </p>
      )}

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
          eyebrow={isLastSkill ? "Модуль пройден" : "Урок пройден"}
          stats={{
            accuracy: Math.round(((problems.length - mistakeIds.size) / Math.max(1, problems.length)) * 100),
            seconds: (Date.now() - startedAt) / 1000,
          }}
          secondaryHref={mistakeIds.size > 0 ? "/student/mistakes" : undefined}
          secondaryLabel={mistakeIds.size > 0 ? "Разобрать ошибки" : undefined}
        />
      )}
    </div>
  );
}

/** Закреплённая верхняя строка урока (с отступом под статус-бар). */
function LessonTopBar({ backHref, children }: { backHref: string; children: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-20 -mx-4 mb-3 bg-paper px-2 pt-[var(--app-sat)]">
      <div className="flex h-14 items-center gap-2 pr-2">
        <a
          href={backHref}
          aria-label="Выйти из урока"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft transition hover:text-ink"
        >
          <IconClose className="h-6 w-6" />
        </a>
        {children}
      </div>
    </div>
  );
}
