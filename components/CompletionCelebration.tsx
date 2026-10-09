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
  stats,
  secondaryHref,
  secondaryLabel,
  reminderHref,
}: {
  subtopicTitle: string;
  xpEarned: number;
  bonusXp?: number;
  nextHref: string;
  nextLabel: string;
  isLastSubtopic?: boolean;
  eyebrow?: string;
  /** Точность (% задач без ошибок) и время урока — показываются плитками. */
  stats?: { accuracy?: number; seconds?: number };
  /** Вторая, тихая ссылка под главной кнопкой (например, «Разобрать ошибки»). */
  secondaryHref?: string;
  secondaryLabel?: string;
  /** Telegram не подключён: предложить напоминание, чтобы вернуться завтра. */
  reminderHref?: string;
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

  const time =
    stats?.seconds !== undefined
      ? `${Math.floor(stats.seconds / 60)}:${String(Math.round(stats.seconds % 60)).padStart(2, "0")}`
      : null;

  // Полноэкранный итог (как в макете): тёмно-зелёный фон, празднующий Гео,
  // плитки «опыт / точность / время», одна большая кнопка внизу.
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Итог урока"
      className="fixed inset-0 z-50 flex animate-fade-in flex-col items-center overflow-y-auto bg-pine-darker px-6 pb-[max(24px,var(--app-sab))] pt-[calc(var(--app-sat)+40px)] text-white"
    >
      <div className="flex w-full max-w-sm flex-1 flex-col items-center">
        {/* Светлый круг за Гео — тёмный контур персонажа иначе теряется на тёмном фоне. */}
        <div className="flex h-48 w-48 animate-scale-in items-center justify-center rounded-full bg-white/10">
          <Mascot mood="celebrating" size={160} />
        </div>
        <p className="mt-4 text-[13px] font-extrabold uppercase tracking-widest text-pine-mint">
          {eyebrow ?? (isLastSubtopic ? "Модуль пройден" : "Урок пройден")}
        </p>
        <h2 className="mt-1 text-center font-display text-[26px] font-black leading-tight">{subtopicTitle}</h2>

        <div className={`mt-7 grid w-full gap-2.5 ${stats ? "grid-cols-3" : "grid-cols-1"}`}>
          <Tile label="Опыт" value={`+${displayedXp}`} tone="text-amber-dark" />
          {stats?.accuracy !== undefined && <Tile label="Точность" value={`${stats.accuracy}%`} tone="text-pine-dark" />}
          {time && <Tile label="Время" value={time} tone="text-violet-dark" />}
        </div>

        {bonusXp > 0 && (
          <p className="mt-4 flex items-center justify-center gap-1.5 rounded-pill bg-white/10 px-4 py-2 text-[13px] font-extrabold">
            <IconStar className="h-4 w-4 text-amber" />
            Без единой ошибки — бонус +{bonusXp} XP
          </p>
        )}

        {reminderHref && (
          <a
            href={reminderHref}
            className="mt-4 flex w-full items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 text-left transition hover:bg-white/15"
          >
            <span aria-hidden className="text-[22px]">🔔</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-black">Напомнить завтра?</span>
              <span className="block text-[12px] text-white/70">Подключи Telegram — вечером напомним, если серия может прерваться.</span>
            </span>
          </a>
        )}

        <div className="min-h-8 flex-1" />

        <a
          href={nextHref}
          className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-white px-5 py-3 text-center font-display text-[17px] font-black leading-snug text-pine-darker shadow-[0_4px_0_rgba(0,0,0,0.25)] transition active:translate-y-0.5"
        >
          {nextLabel}
        </a>
        {secondaryHref && secondaryLabel && (
          <a href={secondaryHref} className="mt-2 flex min-h-[44px] items-center justify-center text-[15px] font-bold text-pine-mint">
            {secondaryLabel}
          </a>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl bg-white px-2 py-3 text-center text-ink">
      <p className={`text-[11px] font-black uppercase tracking-wide ${tone}`}>{label}</p>
      <p className="mt-1 font-display text-[24px] font-black leading-none">{value}</p>
    </div>
  );
}
