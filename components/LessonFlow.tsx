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
  detailedPreview = null,
  reminderHref,
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
  /** Free: задача второй части этого навыка — витрина с эталоном и ссылкой на Pro. */
  detailedPreview?: { text: string; solution: string; egeTaskNumber: number | null } | null;
  /** Куда вести за напоминанием (Telegram не подключён) — показывается на экране «Урок пройден». */
  reminderHref?: string;
}) {
  const allSolvedInitially = problems.every((p) => isDone(initialStates[p.id]?.status));
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
  // После развёрнутого решения ученик читает эталон (и может заказать
  // проверку) — праздничный экран тогда открывается кнопкой, а не сам.
  const [holdCelebration, setHoldCelebration] = useState(false);
  // Для итога урока: когда начали и в каких задачах ошибались.
  const [startedAt] = useState(() => Date.now());
  const [mistakeIds, setMistakeIds] = useState<Set<string>>(new Set());

  const solvedCount = problems.filter((p) => isDone(states[p.id]?.status)).length;

  /**
   * Задача закрыта: верный ответ, самопроверка развёрнутого решения или
   * развёрнутое решение ушло репетитору («pending»). Урок засчитывается сразу,
   * не дожидаясь проверки, — и праздничный экран показывается всегда.
   */
  function handleSolved(problemId: string, kind: "answer" | "self_checked" | "submitted") {
    const nextState: ProblemState =
      kind === "submitted" ? { ...states[problemId], status: "pending" } : { status: "solved" };
    const wasDone = isDone(states[problemId]?.status);
    setStates((prev) => ({ ...prev, [problemId]: nextState }));
    if (!wasDone) setCombo((c) => c + 1);
    const newSolvedCount = problems.filter((p) =>
      p.id === problemId ? true : isDone(states[p.id]?.status)
    ).length;
    if (!wasAlreadyComplete && !wasDone && newSolvedCount === problems.length) {
      // После самопроверки ученик сначала читает эталон (и может заказать
      // проверку) — праздник по кнопке «Завершить урок». В остальных случаях сам.
      // На Free под последней задачей появляется витрина задачи второй части —
      // праздник тоже по кнопке, чтобы не закрыть её сразу.
      if (kind === "self_checked" || detailedPreview) setHoldCelebration(true);
      else setTimeout(() => setShowCelebration(true), kind === "submitted" ? 900 : 500);
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
  const canGoNext = isDone(currentState.status);

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
                onClick={() => setIndex(i)}
                aria-label={`Задача ${i + 1}${st === "solved" ? ", решена" : st === "pending" ? ", на проверке" : st === "needs_revision" ? ", на доработке" : ""}`}
                aria-current={i === index ? "step" : undefined}
                className="flex h-11 flex-1 items-center"
              >
                <span
                  className={`block h-3 w-full rounded-pill transition-all ${
                    st === "solved" ? "bg-pine" : st === "pending" ? "bg-amber" : st === "needs_revision" ? "bg-coral" : "bg-grid"
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
        onSolved={() => handleSolved(current.id, current.answerType === "DETAILED" ? "self_checked" : "answer")}
        onSubmitted={() => handleSolved(current.id, "submitted")}
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
                holdCelebration ? (
                  <button type="button" onClick={() => setShowCelebration(true)} className="btn-primary !h-14 w-full !text-base">
                    Завершить урок
                  </button>
                ) : (
                  <a href={nextHref} className="btn-primary !h-14 w-full !text-base">
                    {nextLabel}
                  </a>
                )
              ) : (
                <button
                  type="button"
                  onClick={() => setIndex(problems.findIndex((p) => !isDone(states[p.id]?.status)))}
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

      {detailedPreview && isLast && canGoNext && <DetailedPreview preview={detailedPreview} />}

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
          reminderHref={reminderHref}
        />
      )}
    </div>
  );
}

/** Витрина задачи второй части на Free: условие, эталон по кнопке, ссылка на Pro. */
function DetailedPreview({ preview }: { preview: { text: string; solution: string; egeTaskNumber: number | null } }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="mt-4 rounded-2xl border-2 border-dashed border-violet/40 bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {preview.egeTaskNumber && (
          <span className="rounded-pill bg-amber-light px-2.5 py-1 text-[11px] font-extrabold text-amber-text">
            ЕГЭ №{preview.egeTaskNumber}
          </span>
        )}
        <span className="rounded-pill bg-violet-light px-2.5 py-1 text-[11px] font-extrabold text-violet-text">
          Задача второй части · Pro
        </span>
      </div>
      <p className="text-[15px] font-semibold leading-relaxed text-ink">{preview.text}</p>
      {open ? (
        <div className="mt-3 rounded-xl bg-paper p-3">
          <p className="mb-1 text-[12px] font-extrabold text-ink-soft">Эталонное решение</p>
          <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-ink">{preview.solution}</p>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="mt-3 text-[14px] font-extrabold text-violet-text underline-offset-2 hover:underline">
          Посмотреть, как решается
        </button>
      )}
      <p className="mt-3 text-[13px] text-ink-soft">
        В Pro такие задачи решаешь сам: отправляешь решение текстом или фото и сверяешься с эталоном по шагам.
      </p>
      <a href="/student/upgrade" className="btn-primary mt-3 !h-11 w-full !text-[14px]">
        Открыть задачи второй части
      </a>
    </section>
  );
}

/** Задача закрыта для урока: решена, самопроверена или отправлена на проверку
 * (и даже возвращена на доработку — урок уже засчитан, доработка идёт отдельно). */
function isDone(status: ProblemState["status"] | undefined): boolean {
  return status === "solved" || status === "pending" || status === "needs_revision";
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
