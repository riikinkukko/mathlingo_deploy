"use client";

import { useState, useTransition } from "react";
import { reviewAttemptAction } from "@/app/actions";
import { PendingReview } from "@/lib/queries";

export default function PendingReviewCard({ review }: { review: PendingReview }) {
  const [feedback, setFeedback] = useState("");
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function decide(decision: "approved" | "needs_revision") {
    startTransition(async () => {
      const res = await reviewAttemptAction(review.attemptId, decision, feedback);
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
