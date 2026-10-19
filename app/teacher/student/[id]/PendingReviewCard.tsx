"use client";

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { reviewAttemptAction } from "@/app/actions";
import type { PendingReview } from "@/lib/queries";
import type { MarkupItem } from "@/components/ImageMarkup";
import { defaultDecisionForScore, maxPointsForTask, scoreLabel } from "@/lib/ege-points";

// Редактор разметки грузится только по нажатию «Разметить».
const ImageMarkup = dynamic(() => import("@/components/ImageMarkup"), { ssr: false });

export default function PendingReviewCard({
  review,
  nextHref,
}: {
  review: PendingReview;
  /** Очередь проверок: куда перейти после решения (следующая работа или «всё проверено»). */
  nextHref?: string;
}) {
  const router = useRouter();
  const [feedback, setFeedback] = useState("");
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const [markupOpen, setMarkupOpen] = useState(false);
  const [markup, setMarkup] = useState<{ url: string; items: MarkupItem[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Баллы по критериям ФИПИ: 0..макс. для номера ЕГЭ (необязательно).
  const maxPoints = maxPointsForTask(review.problem.egeTaskNumber);
  const [score, setScore] = useState<number | null>(null);
  const suggested = defaultDecisionForScore(score, maxPoints);
  const fullScore = score !== null && score >= maxPoints;

  function decide(decision: "approved" | "needs_revision") {
    setError(null);
    startTransition(async () => {
      const res = await reviewAttemptAction(review.attemptId, decision, feedback, markup?.url ?? null, score);
      if ("error" in res) {
        setError(res.error ?? "Не получилось сохранить");
        return;
      }
      setDone(true);
      if (nextHref) {
        router.push(nextHref);
        router.refresh();
      }
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
        <p className="whitespace-pre-wrap text-sm text-ink">{review.answer}</p>
        {review.hasImage && (
          <div className="mt-2 overflow-hidden rounded-xl border border-line bg-white">
            <button
              type="button"
              onClick={() => setMarkupOpen(true)}
              className="block w-full"
              aria-label="Открыть фото и разметить"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={markup?.url ?? `/api/attempt-image/${review.attemptId}`}
                alt={markup ? "Решение ученика с вашими пометками" : "Решение ученика"}
                loading="lazy"
                className="max-h-96 w-full object-contain"
              />
            </button>
            <div className="flex items-center gap-2 border-t border-line-soft px-2 py-1.5">
              <button
                type="button"
                onClick={() => setMarkupOpen(true)}
                disabled={pending}
                className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-pine-light text-[14px] font-extrabold text-pine-dark transition hover:brightness-95"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
                {markup ? "Изменить пометки" : "Разметить фото"}
              </button>
              {markup ? (
                <button
                  type="button"
                  onClick={() => setMarkup(null)}
                  disabled={pending}
                  className="h-10 rounded-xl px-3 text-[13px] font-bold text-ink-soft"
                >
                  Убрать пометки
                </button>
              ) : (
                <a
                  href={`/api/attempt-image/${review.attemptId}`}
                  target="_blank"
                  rel="noopener"
                  className="flex h-10 items-center rounded-xl px-3 text-[13px] font-bold text-ink-soft"
                >
                  Открыть
                </a>
              )}
            </div>
            {markup && (
              <p className="px-3 pb-2 text-[12px] font-bold text-pine-dark">Ученик увидит фото с вашими пометками.</p>
            )}
          </div>
        )}
        {markupOpen && (
          <ImageMarkup
            src={`/api/attempt-image/${review.attemptId}`}
            initialItems={markup?.items}
            onCancel={() => setMarkupOpen(false)}
            aside={
              <div className="space-y-4">
                <div>
                  <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-ink-soft">
                    {review.student.name} · {review.skillTitle}
                  </p>
                  <p className="whitespace-pre-wrap font-semibold text-ink">{review.problem.text}</p>
                </div>
                {review.answer.trim() && (
                  <div className="rounded-xl border border-line bg-paper p-3">
                    <p className="mb-1 text-xs font-extrabold uppercase text-ink-soft">Ответ ученика</p>
                    <p className="whitespace-pre-wrap text-ink">{review.answer}</p>
                  </div>
                )}
                <div>
                  <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-ink-soft">Эталонное решение</p>
                  <p className="whitespace-pre-wrap text-ink-soft">{review.problem.explanation || review.problem.correctAnswer}</p>
                </div>
              </div>
            }
            onDone={(url, items) => {
              setMarkup(items.length ? { url, items } : null);
              setMarkupOpen(false);
            }}
          />
        )}
      </div>

      <details className="mb-3 text-sm">
        <summary className="cursor-pointer font-bold text-pine">Эталонное решение (для сверки)</summary>
        <p className="mt-2 text-ink-soft">{review.problem.explanation}</p>
      </details>

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
            {score === null
              ? "необязательно"
              : fullScore
                ? `${scoreLabel(score, maxPoints)} — решение засчитается`
                : `${scoreLabel(score, maxPoints)} — можно отправить на доработку или одобрить`}
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
  );
}
