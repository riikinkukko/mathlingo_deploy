"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reviewAttemptAction } from "@/app/actions";
import type { ReviewItem } from "@/lib/review-item";
import { loadReviewDraft, REVIEW_DRAFT_EVENT } from "@/lib/review-markup";
import { defaultDecisionForScore, maxPointsForTask, scoreLabel } from "@/lib/ege-points";

import { openReview } from "@/components/review/ReviewWorkspaceHost";

/**
 * Работа на проверке в списке: фото, ответ и быстрая оценка без пометок.
 * «Проверить» открывает полноэкранную проверку — с пометками на фото,
 * критериями ФИПИ и переходом к следующей работе из queue.
 */
export default function PendingReviewCard({
  review,
  queue,
  nextHref,
}: {
  review: ReviewItem;
  /** Все работы, по которым можно пройти подряд в полноэкранной проверке. */
  queue?: ReviewItem[];
  /** Очередь проверок: куда перейти после быстрой оценки (следующая работа или «всё проверено»). */
  nextHref?: string;
}) {
  const router = useRouter();
  const [feedback, setFeedback] = useState("");
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const [hasDraft, setHasDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const maxPoints = maxPointsForTask(review.problem.egeTaskNumber);
  const [score, setScore] = useState<number | null>(null);
  const suggested = defaultDecisionForScore(score, maxPoints);
  const fullScore = score !== null && score >= maxPoints;

  // Незаконченная проверка с пометками — продолжить её на весь экран, а не оценивать тут.
  useEffect(() => {
    const check = () => {
      const d = loadReviewDraft(review.attemptId);
      setHasDraft(!!d && (d.items.length > 0 || d.rot !== 0));
    };
    check();
    window.addEventListener(REVIEW_DRAFT_EVENT, check);
    return () => window.removeEventListener(REVIEW_DRAFT_EVENT, check);
  }, [review.attemptId]);

  const open = () => openReview(queue?.length ? queue : [review], review.attemptId);

  function decide(decision: "approved" | "needs_revision") {
    setError(null);
    startTransition(async () => {
      const res = await reviewAttemptAction(review.attemptId, decision, feedback, null, score);
      if ("error" in res) {
        setError(res.error ?? "Не получилось сохранить");
        return;
      }
      setDone(true);
      if (nextHref) router.push(nextHref);
      router.refresh();
    });
  }

  if (done && nextHref) {
    return (
      <div className="card flex items-center gap-3 p-5" role="status">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-pine-light font-black text-pine-dark">✓</span>
        <p className="text-sm font-bold text-ink">Проверка сохранена — открываем следующую работу…</p>
      </div>
    );
  }
  if (done) return null;

  const approveCls = suggested === "needs_revision" ? "btn-secondary flex-1" : "btn-primary flex-1";
  const reviseCls =
    suggested === "needs_revision"
      ? "btn-primary flex-1 whitespace-nowrap !bg-coral-text !px-3"
      : "btn-secondary flex-1 whitespace-nowrap !px-3 hover:!border-coral hover:!text-coral";

  return (
    <div className="card p-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-black text-ink">{review.student.name}</p>
        <span className="flex flex-wrap items-center gap-1.5">
          {review.problem.egeTaskNumber && (
            <span className="rounded-pill bg-amber-light px-2.5 py-1 text-[11px] font-extrabold text-amber-dark">
              №{review.problem.egeTaskNumber}
            </span>
          )}
          {review.fromMock && (
            <span className="rounded-pill bg-pine-light px-2.5 py-1 text-[11px] font-extrabold text-pine-dark">Пробник</span>
          )}
          <span className="rounded-pill bg-violet-light px-2.5 py-1 text-[11px] font-extrabold text-violet">
            {review.skillTitle}
          </span>
        </span>
      </div>
      <p className="mb-3 text-sm font-semibold text-ink">{review.problem.text}</p>

      <div className="mb-3 rounded-xl border border-line bg-paper p-3">
        <p className="mb-1 text-xs font-extrabold uppercase text-ink-soft">Ответ ученика</p>
        {review.answer.trim() && <p className="whitespace-pre-wrap text-sm text-ink">{review.answer}</p>}
        {review.hasImage && (
          <button
            type="button"
            onClick={open}
            className="mt-2 block w-full overflow-hidden rounded-xl border border-line bg-white"
            aria-label="Открыть решение на весь экран"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/attempt-image/${review.attemptId}`} alt="Решение ученика" loading="lazy" className="max-h-96 w-full object-contain" />
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={open}
        className="mb-3 flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-pine-strong text-[15px] font-black text-white shadow-[0_3px_0_#13804F] transition hover:brightness-105"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
        {hasDraft ? "Продолжить проверку" : review.hasImage ? "Проверить с пометками на фото" : "Проверить на весь экран"}
      </button>

      {hasDraft ? (
        <p className="text-center text-[12px] font-bold text-ink-soft">
          Пометки на фото сохранены на этом устройстве — оценка ставится там же.
        </p>
      ) : (
        <details className="group">
          <summary className="cursor-pointer list-none text-center text-[13px] font-extrabold text-ink-soft hover:text-pine-dark">
            Быстрая оценка без пометок <span className="inline-block transition group-open:rotate-180">▾</span>
          </summary>
          <div className="mt-3">
            <textarea
              className="input mb-3 min-h-[70px] resize-y text-sm"
              placeholder="Комментарий ученику (необязательно)"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              disabled={pending}
            />
            <fieldset className="mb-3" disabled={pending}>
              <legend className="mb-1.5 text-xs font-extrabold uppercase tracking-wide text-ink-soft">
                Баллы по критериям ФИПИ{review.problem.egeTaskNumber ? ` · №${review.problem.egeTaskNumber}` : ""} · максимум {maxPoints}
              </legend>
              <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Баллы">
                {Array.from({ length: maxPoints + 1 }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    role="radio"
                    aria-checked={score === i}
                    onClick={() => setScore(score === i ? null : i)}
                    className={`h-10 min-w-10 rounded-xl border-2 px-3 font-mono text-[15px] font-black transition ${
                      score === i
                        ? i === maxPoints
                          ? "border-pine-strong bg-pine-strong text-white"
                          : "border-ink bg-ink text-white"
                        : "border-line-soft bg-white text-ink hover:border-ink-soft"
                    }`}
                  >
                    {i}
                  </button>
                ))}
                <span className="ml-1 text-[12px] text-ink-soft">
                  {score === null ? "необязательно" : fullScore ? `${scoreLabel(score, maxPoints)} — решение засчитается` : scoreLabel(score, maxPoints)}
                </span>
              </div>
            </fieldset>
            {error && <p className="mb-2 text-sm font-semibold text-coral">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => decide("approved")} disabled={pending} className={approveCls}>
                {score !== null ? `Одобрить · ${score}/${maxPoints}` : "Одобрить"}
              </button>
              <button
                onClick={() => decide("needs_revision")}
                disabled={pending || fullScore}
                title={fullScore ? "Полный балл — решение засчитывается" : undefined}
                className={`${reviseCls} disabled:opacity-40`}
              >
                {score !== null && !fullScore ? `Доработать · ${score}/${maxPoints}` : "Доработать"}
              </button>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
