"use client";

import { useEffect, useState } from "react";
import confetti from "canvas-confetti";
import { IconStar } from "./icons";
import Mascot from "./Mascot";

export default function CompletionCelebration({
  subtopicTitle,
  xpEarned,
  bonusXp = 0,
  nextHref,
  nextLabel,
  isLastSubtopic = false,
  eyebrow,
}: {
  subtopicTitle: string;
  xpEarned: number;
  bonusXp?: number;
  nextHref: string;
  nextLabel: string;
  isLastSubtopic?: boolean;
  eyebrow?: string;
}) {
  const [displayedXp, setDisplayedXp] = useState(0);
  const totalXp = xpEarned + bonusXp;

  useEffect(() => {
    const duration = 900;
    const start = performance.now();
    function tick(now: number) {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayedXp(Math.round(eased * totalXp));
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    const colors = ["#1CAE6B", "#F0A93C", "#16B3A6", "#8B6BE0"];
    const scale = isLastSubtopic ? 1.6 : 1;
    confetti({
      particleCount: Math.round(90 * scale),
      spread: 75,
      startVelocity: 38,
      origin: { y: 0.35 },
      colors,
      zIndex: 60,
    });
    const t = setTimeout(() => {
      confetti({
        particleCount: Math.round(50 * scale),
        spread: 100,
        startVelocity: 25,
        origin: { y: 0.35 },
        colors,
        zIndex: 60,
      });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-ink/40 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm animate-scale-in rounded-card bg-white p-8 text-center shadow-soft">
        <div className="mx-auto mb-2 flex h-24 items-center justify-center">
          <Mascot mood="celebrating" size={88} />
        </div>
        <p className="text-xs font-extrabold uppercase tracking-widest text-ink-soft">
          {eyebrow ?? (isLastSubtopic ? "Модуль пройден 🎉" : "Тема пройдена")}
        </p>
        <h2 className="mt-1 font-display text-2xl font-black text-ink">{subtopicTitle}</h2>

        <div className="mx-auto mt-5 inline-flex items-center gap-2 rounded-pill bg-amber-light px-5 py-2.5">
          <span className="font-display text-2xl font-black text-amber">+{displayedXp}</span>
          <span className="text-sm font-extrabold uppercase tracking-wide text-amber">XP</span>
        </div>

        {bonusXp > 0 && (
          <p className="mt-2.5 flex items-center justify-center gap-1.5 text-xs font-extrabold text-pine">
            <IconStar className="h-3.5 w-3.5" />
            Идеально! Ни одной ошибки — бонус +{bonusXp} XP
          </p>
        )}

        <a href={nextHref} className="btn-primary mt-7 w-full">
          {nextLabel}
        </a>
      </div>
    </div>
  );
}
