"use client";

import { useState } from "react";
import { TheoryCard } from "@/lib/types";
import DiagramRenderer from "./diagrams/DiagramRenderer";
import { IconBook } from "./icons";
import Mascot from "./Mascot";

export default function TheoryCards({
  cards,
  onComplete,
  completeLabel,
  onClose,
  stickyNav = false,
}: {
  cards: TheoryCard[];
  onComplete: () => void;
  completeLabel: string;
  onClose?: () => void;
  /** Полноэкранная теория в уроке: на телефоне «Назад / Дальше» — в той же
   * закреплённой нижней панели, что «Проверить» и «Дальше» у задач.
   * Раньше кнопка прыгала вверх-вниз вслед за высотой карточки. */
  stickyNav?: boolean;
}) {
  const [i, setI] = useState(0);
  const card = cards[i];
  const isLast = i === cards.length - 1;

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-pine">
          <IconBook className="h-4 w-4" />
          Теория {i + 1}/{cards.length}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-full border-2 border-line px-3 py-1 text-xs font-extrabold text-ink-soft hover:border-pine hover:text-pine"
          >
            Закрыть
          </button>
        )}
      </div>

      <div key={i} className="card animate-slide-up-fade min-h-[320px] p-6">
        <div className="mb-3 flex items-start gap-3">
          <Mascot mood={isLast ? "hint" : "idle"} size={52} interactive float={false} className="shrink-0" />
          <div className="min-w-0 flex-1 pt-1">
            <h3 className="font-display text-xl font-black text-ink">{card.title}</h3>
            {card.formula && (
              <div className="mt-2 inline-block rounded-xl bg-pine-light px-4 py-2 font-mono text-base font-bold text-pine-dark">
                {card.formula}
              </div>
            )}
          </div>
        </div>
        {card.diagram && (
          <div className="mb-4 h-40 rounded-2xl bg-pine-light/30 p-2">
            <DiagramRenderer spec={card.diagram} />
          </div>
        )}
        <p className="mt-1 text-[15px] leading-relaxed text-ink-soft">{card.body}</p>
      </div>

      <div className="mt-4 flex items-center justify-center gap-2">
        {cards.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setI(idx)}
            className={`h-2 rounded-pill transition-all ${
              idx === i ? "w-6 bg-pine" : "w-2 bg-line hover:bg-pine/40"
            }`}
            aria-label={`Карточка ${idx + 1}`}
          />
        ))}
      </div>

      <div
        className={
          stickyNav
            ? "fixed inset-x-0 bottom-0 z-30 border-t border-line-soft bg-white px-4 pb-[max(16px,var(--app-sab))] pt-3 lg:static lg:mt-4 lg:border-0 lg:bg-transparent lg:p-0"
            : "mt-4"
        }
      >
        <div className={`flex gap-2 ${stickyNav ? "mx-auto max-w-2xl" : ""}`}>
          {i > 0 && (
            <button onClick={() => setI(i - 1)} className={`btn-secondary flex-1 ${stickyNav ? "!h-14 lg:!h-auto" : ""}`}>
              Назад
            </button>
          )}
          <button
            onClick={() => (isLast ? onComplete() : setI(i + 1))}
            className={`btn-primary flex-[2] ${stickyNav ? "!h-14 !text-base lg:!h-auto lg:!text-sm" : ""}`}
          >
            {isLast ? completeLabel : "Дальше →"}
          </button>
        </div>
      </div>
    </div>
  );
}
