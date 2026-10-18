"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import PaidReviewOffer from "./PaidReviewOffer";
import { submitAttemptAction, revealSolutionAction } from "@/app/actions";
import { PublicProblem, SolvedInfo } from "@/lib/types";
import { IconLightbulb, IconBook, IconCheck, IconClipboard, IconBattery } from "./icons";
import DiagramRenderer from "./diagrams/DiagramRenderer";
import { ymGoal } from "@/lib/ym";
import DiagramScratchpad from "./diagrams/DiagramScratchpad";
import MathKeyboard from "./MathKeyboard";
import Mascot from "./Mascot";
import AskTeacherButton from "./AskTeacherButton";
import { hasSavedSketch, loadSketch, renderSketchJpeg } from "@/lib/sketch";
import { fileToJpeg } from "@/lib/image-compress";
import type { ReviewInfo } from "@/lib/queries";
import { scoreLabel } from "@/lib/ege-points";

/** Фото решения ученика — с пометками репетитора, если они есть. */
function ReviewPhoto({ review }: { review: ReviewInfo }) {
  if (!review.image) return null;
  const marked = review.image === "markup";
  const src = `/api/attempt-image/${review.attemptId}${marked ? "?v=markup" : ""}`;
  return (
    <a href={src} target="_blank" rel="noopener" className="mt-2.5 block overflow-hidden rounded-xl border border-line bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={marked ? "Твоё решение с пометками репетитора" : "Твоё решение"} loading="lazy" className="max-h-80 w-full object-contain" />
      <span className="block px-3 py-1.5 text-[12px] font-bold text-ink-soft">
        {marked ? "Пометки репетитора · нажми, чтобы открыть крупно" : "Твоё фото · нажми, чтобы открыть крупно"}
      </span>
    </a>
  );
}

/** «2 из 3 баллов» — баллы репетитора по критериям ФИПИ, если он их ставил. */
function ReviewScore({ review }: { review: ReviewInfo }) {
  if (review.score === undefined || review.maxScore === undefined) return null;
  return (
    <span className="rounded-pill bg-white px-2.5 py-0.5 text-[12px] font-black text-ink">
      {scoreLabel(review.score, review.maxScore)}
    </span>
  );
}

type WrongState = { hint: string; wrongCount: number; canRevealSolution: boolean };
export type ProblemCardStatus = "unsolved" | "solved" | "pending" | "needs_revision";

export default function ProblemCard({
  problem,
  status,
  solvedInfo,
  feedback,
  previousAnswer,
  review,
  allowHints = true,
  source,
  locked = false,
  onSolved,
  onSubmitted,
  onWrong,
  onOpenTheory,
  canAskTeacher = false,
  stickySubmit = false,
}: {
  problem: PublicProblem;
  status: ProblemCardStatus;
  solvedInfo?: SolvedInfo | null;
  feedback?: string;
  previousAnswer?: string;
  /** проверка репетитора: фото с пометками, комментарий */
  review?: ReviewInfo;
  allowHints?: boolean;
  source: "lesson" | "assignment" | "review";
  locked?: boolean;
  onSolved?: () => void;
  /** Развёрнутое решение ушло репетитору на проверку (урок при этом засчитан). */
  onSubmitted?: () => void;
  onWrong?: () => void;
  /** Кнопка "Теория" в панели инструментов — опциональна: есть только там,
   * где родитель (LessonFlow) реально владеет карточками теории навыка. */
  onOpenTheory?: () => void;
  /** Кнопка «Не понял — спросить репетитора» (только у учеников репетитора). */
  canAskTeacher?: boolean;
  /** Урок на телефоне: «Проверить» в закреплённой нижней панели — там же,
   * где потом появляется «Дальше» (LessonFlow), чтобы кнопка не прыгала. */
  stickySubmit?: boolean;
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
  // Проверка прошлой попытки; после новой отправки она уже не про это решение.
  const [rev, setRev] = useState<ReviewInfo | undefined>(review);
  const [justSolved, setJustSolved] = useState(false);
  const [shakeSeq, setShakeSeq] = useState(0);
  const [formulaOpen, setFormulaOpen] = useState(false);
  const [scratchpadOpen, setScratchpadOpen] = useState(false);
  const [hasSketch, setHasSketch] = useState(false);
  // Черновик хранится на устройстве по задаче — метка «есть пометки» сразу.
  useEffect(() => {
    setHasSketch(hasSavedSketch(problem.id));
  }, [problem.id]);
  const diagramBoxRef = useRef<HTMLDivElement>(null);
  // Развёрнутое решение: фото тетради или снимок черновика вместо набора текста.
  const [solutionImage, setSolutionImage] = useState<{ url: string; kind: "photo" | "sketch" } | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  async function onPhotoPicked(file: File | undefined) {
    if (!file) return;
    setImageError(null);
    setImageBusy(true);
    const url = await fileToJpeg(file);
    setImageBusy(false);
    if (url) setSolutionImage({ url, kind: "photo" });
    else setImageError("Не получилось обработать фото — попробуй другое");
  }

  async function attachSketch() {
    setImageError(null);
    setImageBusy(true);
    const doc = loadSketch(problem.id);
    const url = doc?.items.length
      ? await renderSketchJpeg(doc, (diagramBoxRef.current?.querySelector("svg") as SVGSVGElement | null) ?? null)
      : null;
    setImageBusy(false);
    if (url) setSolutionImage({ url, kind: "sketch" });
    else setImageError("Черновик пустой — сначала реши в нём");
  }
  const [noEnergy, setNoEnergy] = useState(false);
  const [noEnergyUnverified, setNoEnergyUnverified] = useState(false);
  const [selfChecked, setSelfChecked] = useState(false);
  const [reviewOffer, setReviewOffer] = useState<{ attemptId: string; priceRub: number } | null>(null);
  // Отказ сервера (задача в идущей контрольной, время вышло и т. п.) — раньше
  // молча игнорировался, и кнопка «Проверить» просто ничего не делала.
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const answerInputRef = useRef<HTMLInputElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  // Пустая отправка — раньше кнопка молча ничего не делала и казалась сломанной.
  const [emptyError, setEmptyError] = useState(false);

  // После неверного ответа подсказка должна оказаться на экране. Раньше поле
  // получало autoFocus, клавиатура открывалась заново и закрывала подсказку
  // (а на 1280×720 подсказка просто уезжала ниже первого экрана).
  useEffect(() => {
    if (shakeSeq === 0) return;
    answerInputRef.current?.blur();
    const t = setTimeout(() => {
      const el = hintRef.current;
      if (!el) return;
      // scrollIntoView({block:"nearest"}) не учитывает закреплённую нижнюю
      // панель с «Проверить» (scroll-margin в Chrome тут игнорируется), поэтому
      // докручиваем сами: низ подсказки — над панелью, верх — не под шапкой урока.
      const r = el.getBoundingClientRect();
      const bottomBar = stickySubmit && window.innerWidth < 1024 ? 104 : 16;
      const topBar = 72;
      const overBottom = r.bottom - (window.innerHeight - bottomBar);
      if (overBottom > 0) {
        window.scrollBy({ top: Math.min(overBottom, Math.max(0, r.top - topBar)), behavior: "smooth" });
      } else if (r.top < topBar) {
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }, 60);
    return () => clearTimeout(t);
  }, [shakeSeq, stickySubmit]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim() && !(isDetailed && solutionImage)) {
      setEmptyError(true);
      return;
    }
    setEmptyError(false);
    startTransition(async () => {
      await runSubmit();
    });
  }

  /** Отправка ответа — из формы под задачей и из поля ответа в черновике. */
  async function runSubmit(): Promise<"correct" | "wrong" | "other"> {
    {
      const res = await submitAttemptAction(problem.id, answer, source, isDetailed ? solutionImage?.url ?? null : null);
      if ("error" in res) {
        setServerError(typeof res.error === "string" ? res.error : "Не удалось отправить ответ");
        return "other";
      }
      setServerError(null);

      if (res.kind === "no_energy") {
        setNoEnergy(true);
        setNoEnergyUnverified(!!res.emailUnverified);
        return "other";
      }
      if (res.kind === "pending") {
        setPendingReview(true);
        setNeedsRevision(false);
        setSolutionImage(null);
        setRev(undefined);
        onSubmitted?.();
        return "other";
      }
      if (res.kind === "correct") {
        setCorrectResult({ explanation: res.explanation, correctAnswer: res.correctAnswer });
        setWrongState(null);
        if ("selfChecked" in res && res.selfChecked) {
          setSelfChecked(true);
          if ("paidReviewPrice" in res && res.paidReviewPrice && res.attemptId) {
            setReviewOffer({ attemptId: res.attemptId, priceRub: res.paidReviewPrice });
          }
        }
        const wasAlreadySolved = solved;
        setSolved(true);
        if (!wasAlreadySolved) {
          setJustSolved(true);
          ymGoal("problem_solved");
          onSolved?.();
        }
        return "correct";
      }
      // wrong
      setWrongState({ hint: res.hint, wrongCount: res.wrongCount, canRevealSolution: res.canRevealSolution });
      setShakeSeq((n) => n + 1);
      onWrong?.();
      return "wrong";
    }
  }

  function handleReveal() {
    startTransition(async () => {
      const res = await revealSolutionAction(problem.id);
      if ("error" in res) {
        setServerError(res.error ?? null);
        return;
      }
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
            <span className="whitespace-nowrap rounded-pill bg-amber-light px-2.5 py-1 text-[11px] font-extrabold text-amber-text">
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
          {/* Для задач без готовой диаграммы — отдельная кнопка открытия
              пустого холста (например, тригонометрия: ученик рисует
              единичную окружность сам). Если диаграмма ЕСТЬ, холст уже
              открывается по тапу на неё ниже — вторая кнопка была бы
              дублирующим способом попасть туда же. */}
          {!problem.diagram && (
            <button
              type="button"
              onClick={() => setScratchpadOpen(true)}
              className="rounded-pill border-2 border-line px-3 py-1.5 text-xs font-extrabold text-ink-soft transition hover:border-pine hover:text-pine"
            >
              {hasSketch ? "Черновик •" : "Черновик"}
            </button>
          )}
        </div>
      </div>

      {pendingReview && (
        <div className="mb-3">
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
            <div ref={diagramBoxRef} className="h-full w-full">
              <DiagramRenderer spec={problem.diagram} />
            </div>
            <span className="absolute right-2.5 top-2.5 flex h-9 items-center gap-1.5 rounded-[12px] border border-line bg-white px-2.5 text-[12px] font-extrabold text-ink-soft shadow-soft transition group-active:scale-95">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
              Черновик
            </span>
            {hasSketch && (
              <span className="absolute left-2.5 top-2.5 rounded-pill bg-coral-light px-2 py-0.5 text-[10px] font-extrabold text-coral-text">
                есть пометки
              </span>
            )}
          </button>
          <p className="mb-4 text-[12px] font-bold text-ink-soft">
            {hasSketch ? "Пометки сохранены — нажми, чтобы продолжить" : "Нажми на чертёж, чтобы чертить и решать"}
          </p>
        </>
      )}

      {scratchpadOpen && (
        <DiagramScratchpad
          problemId={problem.id}
          spec={problem.diagram}
          problemText={problem.text}
          egeNumber={problem.egeTaskNumber ?? undefined}
          onClose={() => setScratchpadOpen(false)}
          onChange={setHasSketch}
          answerBar={{
            value: answer,
            onChange: setAnswer,
            onSubmit: runSubmit,
            detailed: isDetailed,
            disabled: !showForm,
          }}
        />
      )}

      <p className="mb-4 whitespace-pre-line text-[16px] font-semibold leading-relaxed text-ink" style={{ textWrap: "pretty" as any }}>
        {problem.text}
      </p>

      {needsRevision && (feedback || rev?.image || rev?.score !== undefined) && !pendingReview && (
        <div className="mb-4 rounded-2xl border-2 border-coral-light bg-coral-light p-3.5 text-sm">
          <p className="mb-1 flex flex-wrap items-center gap-2 font-extrabold text-coral">
            Репетитор просит доработать{feedback ? ":" : ""}
            {rev && <ReviewScore review={rev} />}
          </p>
          {feedback && <p className="whitespace-pre-wrap text-ink-soft">{feedback}</p>}
          {rev && <ReviewPhoto review={rev} />}
        </div>
      )}

      {solved && rev?.approved && (
        <div className="mb-4 rounded-2xl border-2 border-pine-light bg-pine-light/60 p-3.5 text-sm">
          <p className="mb-1 flex flex-wrap items-center gap-2 font-extrabold text-pine-dark">
            {rev.feedback || rev.image ? "Комментарий репетитора" : "Проверено репетитором"}
            <ReviewScore review={rev} />
          </p>
          {rev.feedback && <p className="whitespace-pre-wrap text-ink-soft">{rev.feedback}</p>}
          <ReviewPhoto review={rev} />
        </div>
      )}

      {pendingReview && (
        <div className="rounded-2xl border-2 border-amber-light bg-amber-light p-4 text-sm">
          <p className="mb-2 font-extrabold text-amber-text">Решение отправлено на проверку</p>
          {answer && answer !== "(решение на фото)" && <p className="whitespace-pre-wrap text-ink-soft">{answer}</p>}
          {rev?.image && !needsRevision && <ReviewPhoto review={rev} />}
          {!rev?.image && (!answer || answer === "(решение на фото)") && (
            <p className="text-ink-soft">📷 Решение на фото — репетитор его увидит.</p>
          )}
          {source === "lesson" && (
            <p className="mt-2 text-[13px] font-bold text-ink">
              Задача засчитана — можно идти дальше. Итог проверки придёт в уведомления.
            </p>
          )}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-3">
          {isDetailed ? (
            <>
              <textarea
                className="input min-h-[120px] resize-y font-sans text-[15px]"
                placeholder={
                  solutionImage
                    ? "Можно добавить пояснение или ответ (необязательно)"
                    : "Опиши решение: что дано, какие теоремы применяешь, шаги, ответ. Или приложи фото из тетради."
                }
                value={answer}
                onChange={(e) => {
                  setAnswer(e.target.value);
                  if (emptyError) setEmptyError(false);
                }}
                disabled={pending}
              />
              {solutionImage ? (
                <div className="relative overflow-hidden rounded-2xl border border-line bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={solutionImage.url} alt={solutionImage.kind === "photo" ? "Фото решения" : "Снимок черновика"} className="max-h-72 w-full object-contain" />
                  <p className="px-3 py-1.5 text-[12px] font-bold text-ink-soft">
                    {solutionImage.kind === "photo" ? "Фото решения приложено" : "Снимок черновика приложен"}
                  </p>
                  <button
                    type="button"
                    onClick={() => setSolutionImage(null)}
                    aria-label="Убрать картинку"
                    className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-ink/70 text-white"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={imageBusy || pending}
                    onClick={() => photoInputRef.current?.click()}
                    className="flex h-12 items-center justify-center gap-2 rounded-2xl border-2 border-line bg-white text-[14px] font-extrabold text-ink-soft transition hover:border-pine hover:text-pine disabled:opacity-50"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" /><circle cx="12" cy="13" r="3.5" /></svg>
                    {imageBusy ? "Сжимаем…" : "Фото решения"}
                  </button>
                  <button
                    type="button"
                    disabled={imageBusy || pending || !hasSketch}
                    onClick={attachSketch}
                    title={hasSketch ? undefined : "Сначала реши в черновике"}
                    className="flex h-12 items-center justify-center gap-2 rounded-2xl border-2 border-line bg-white text-[14px] font-extrabold text-ink-soft transition hover:border-pine hover:text-pine disabled:opacity-50"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
                    Из черновика
                  </button>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      void onPhotoPicked(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </div>
              )}
              {imageError && <p className="text-sm font-semibold text-coral">{imageError}</p>}
            </>
          ) : (
            <>
              <div
                className={`flex items-center justify-between rounded-2xl border-2 bg-white px-4 py-3 transition ${
                  wrongState ? "border-coral" : "border-pine"
                } ${shakeSeq > 0 ? "animate-shake" : ""}`}
                key={shakeSeq}
              >
                {/* inputMode="decimal" — цифровая клавиатура с запятой. Минуса и «/»
                    на ней нет (на iOS), поэтому они есть в MathKeyboard ниже:
                    ответы бывают отрицательными и дробями a/b. */}
                <input
                  ref={answerInputRef}
                  className="w-full bg-transparent font-mono text-[20px] font-black text-ink outline-none placeholder:text-ink-soft/50"
                  placeholder="Ответ"
                  aria-label="Ответ"
                  aria-invalid={emptyError || !!wrongState}
                  aria-describedby={emptyError ? `empty-${problem.id}` : undefined}
                  value={answer}
                  onChange={(e) => {
                    setAnswer(e.target.value);
                    if (emptyError) setEmptyError(false);
                  }}
                  disabled={pending}
                  inputMode="decimal"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  enterKeyHint="done"
                />
              </div>
              <MathKeyboard
                inputRef={answerInputRef}
                onInsert={(v) => {
                  setAnswer(v);
                  if (emptyError) setEmptyError(false);
                }}
              />
            </>
          )}
          {emptyError && (
            <p id={`empty-${problem.id}`} role="alert" className="text-[13px] font-bold text-coral-text">
              {isDetailed ? "Напиши решение или приложи фото" : "Сначала введи ответ"}
            </p>
          )}
          <div
            className={
              stickySubmit
                ? "fixed inset-x-0 bottom-0 z-30 border-t border-line-soft bg-white px-4 pb-[max(16px,var(--app-sab))] pt-3 lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0"
                : ""
            }
          >
            <div className={stickySubmit ? "mx-auto max-w-2xl" : ""}>
              <button
                className="btn-primary !h-14 w-full !text-base"
                type="submit"
                disabled={pending}
              >
                {pending ? "Отправляем…" : isDetailed ? "Отправить на проверку" : "Проверить"}
              </button>
            </div>
          </div>
        </form>
      )}

      {locked && !solved && !pendingReview && (
        <p className="rounded-2xl border-2 border-line bg-paper px-4 py-3 text-sm font-bold text-ink-soft">
          ⏱ Время вышло — эта задача осталась без ответа.
        </p>
      )}

      {noEnergy && (
        <div className="rounded-2xl border-2 border-amber-light bg-amber-light p-4">
          <p className="mb-1 flex items-center gap-1.5 font-extrabold text-amber-text">
            <IconBattery className="h-4 w-4 shrink-0" />
            Энергия закончилась
          </p>
          {noEnergyUnverified ? (
            <>
              <p className="mb-3 text-sm text-ink-soft">
                Чтобы энергия восстанавливалась, подтверди email — ссылка в письме,
                которое мы отправили при регистрации. Или переходи на Pro — там
                энергия безлимитна.
              </p>
              <div className="flex flex-wrap gap-2">
                <a href="/student/profile" className="btn-primary !text-xs">
                  Подтвердить email
                </a>
                <a href="/student/upgrade" className="btn-secondary !text-xs">
                  Узнать про Pro
                </a>
              </div>
            </>
          ) : (
            <>
              <p className="mb-3 text-sm text-ink-soft">
                На бесплатном плане ограниченное число новых задач в день. Энергия
                восстанавливается со временем, или переходи на Pro — там она безлимитна.
              </p>
              <a href="/student/upgrade" className="btn-primary !text-xs">
                Узнать про Pro
              </a>
            </>
          )}
        </div>
      )}

      {serverError && (
        <p role="alert" className="mt-3 rounded-xl bg-coral-light px-3 py-2.5 text-sm font-bold text-coral-text">
          {serverError}
        </p>
      )}
      {wrongState && !correctResult && (
        <div
          ref={hintRef}
          className="mt-4 flex animate-slide-up-fade items-start gap-2.5 rounded-2xl border-2 border-amber-light bg-amber-light p-3.5 text-sm leading-relaxed"
        >
          {allowHints && <Mascot mood="thinking" size={40} float={false} className="mt-0.5 shrink-0" />}
          <div className="min-w-0 flex-1">
          {allowHints ? (
            <>
              <p className="mb-1 flex items-center gap-1.5 font-extrabold text-amber-text">
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
            <p className="font-extrabold text-amber-text">
              Неверно. Это контрольный режим — подсказки и разбор недоступны, попробуй ещё раз.
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
                ? "Решение принято — сверься с эталоном ниже"
                : isDetailed
                  ? "Преподаватель проверил — верно!"
                  : "Верно!"}
              {justSolved && (
                <span className="pointer-events-none absolute right-3 top-2 animate-xp-float font-display text-sm font-black text-amber">
                  +10 XP
                </span>
              )}
            </p>
            {isDetailed && correctResult.correctAnswer ? (
              <>
                {/* Эталон по шагам — раньше после самопроверки показывалась только
                    краткая идея, и сверяться было не с чем. */}
                <div className="relative mt-2 rounded-xl bg-white/80 p-3 text-ink">
                  <p className="mb-1 text-[12px] font-extrabold text-ink-soft">Эталонное решение</p>
                  <p className="whitespace-pre-wrap text-[14px] leading-relaxed">{correctResult.correctAnswer}</p>
                </div>
                {correctResult.explanation && (
                  <p className="relative mt-2 text-ink-soft">
                    <span className="font-extrabold text-pine-dark">Главное: </span>
                    {correctResult.explanation}
                  </p>
                )}
              </>
            ) : (
              <p className="relative text-ink-soft">{correctResult.explanation}</p>
            )}
            {selfChecked && reviewOffer && <PaidReviewOffer attemptId={reviewOffer.attemptId} priceRub={reviewOffer.priceRub} />}
          </div>
        </div>
      )}
      {canAskTeacher && !pendingReview && (
        <AskTeacherButton
          problemId={problem.id}
          currentAnswer={answer}
          hasSketch={hasSketch}
          getSketch={async () => {
            const doc = loadSketch(problem.id);
            if (!doc?.items.length) return null;
            return renderSketchJpeg(doc, (diagramBoxRef.current?.querySelector("svg") as SVGSVGElement | null) ?? null);
          }}
        />
      )}
    </div>
  );
}
