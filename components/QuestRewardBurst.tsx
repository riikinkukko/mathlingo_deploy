"use client";

import { useEffect, useRef } from "react";

/**
 * Короткий салют, когда только что выполнены все задания дня. Карточка на
 * главной есть в двух раскладках (телефон/компьютер, одна скрыта CSS), поэтому
 * салют запускает только видимая.
 */
export default function QuestRewardBurst() {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!ref.current || ref.current.offsetParent === null) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    import("canvas-confetti")
      .then(({ default: confetti }) => {
        confetti({ particleCount: 90, spread: 70, origin: { y: 0.35 }, colors: ["#1CAE6B", "#F5B83D", "#8FD9B4", "#FF7A59"] });
      })
      .catch(() => {});
  }, []);
  return (
    <p ref={ref} role="status" className="mb-3 rounded-xl bg-white/80 px-3 py-2 text-center text-[13px] font-black text-amber-text">
      🎉 Все задания дня выполнены!
    </p>
  );
}
