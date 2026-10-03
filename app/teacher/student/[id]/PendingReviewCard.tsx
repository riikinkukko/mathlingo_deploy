"use client";

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { reviewAttemptAction } from "@/app/actions";
import { PendingReview } from "@/lib/queries";
import type { MarkupItem } from "@/components/ImageMarkup";

// Редактор разметки грузится только по нажатию «Разметить».
const ImageMarkup = dynamic(() => import("@/components/ImageMarkup"), { ssr: false });

export default function PendingReviewCard({ review }: { review: PendingReview }) {
  const [feedback, setFeedback] = useState("");
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const [markupOpen, setMarkupOpen] = useState(false);
  const [markup, setMarkup] = useState<{ url: string; items: MarkupItem[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function decide(decision: "approved" | "needs_revision") {
    setError(null);
    startTransition(async () => {
      const res = await reviewAttemptAction(review.attemptId, decision, feedback, markup?.url ?? null);
      if ("error" in res) setError(res.error ?? "Не получилось сохранить");
      if (!("error" in res)) setDone(true);
    });
  }

  if (done) return null;

  return (
    <div className="card p-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-black text-ink">{review.student.name}</p>
        <span className="rounded-pill bg-violet-light px-2.5 py-1 text-[11px] font-extrabold text-violet">
          {review.skillTitle}
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
                className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-coral-light text-[14px] font-extrabold text-coral-text"
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

      {error && <p className="mb-2 text-sm font-semibold text-coral">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => decide("approved")}
          disabled={pending}
          className="btn-primary flex-1 !bg-pine"
        >
          Одобрить
        </button>
        <button
          onClick={() => decide("needs_revision")}
          disabled={pending}
          className="btn-secondary flex-1 hover:!border-coral hover:!text-coral"
        >
          На доработку
        </button>
      </div>
    </div>
  );
}
