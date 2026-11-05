"use client";

import type { ReviewItem } from "@/lib/review-item";
import { openReview } from "./ReviewWorkspaceHost";

/** «Проверять подряд»: вся очередь на весь экран, от самой старой работы. */
export default function ReviewQueueButton({ items, className = "" }: { items: ReviewItem[]; className?: string }) {
  if (!items.length) return null;
  return (
    <button
      type="button"
      onClick={() => openReview(items)}
      className={`flex h-11 items-center justify-center gap-2 rounded-[14px] bg-pine-strong px-4 text-[15px] font-black text-white shadow-[0_3px_0_#13804F] transition hover:brightness-105 ${className}`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 4v16l13-8z" /></svg>
      Проверять подряд
    </button>
  );
}
