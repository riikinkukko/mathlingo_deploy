"use client";

import { useState } from "react";
import { TheoryCard } from "@/lib/types";

export default function TheoryCardsBuilder({ initial }: { initial: TheoryCard[] }) {
  const [cards, setCards] = useState<TheoryCard[]>(initial.length > 0 ? initial : []);
  const [draft, setDraft] = useState<{ title: string; formula: string; body: string }>({
    title: "",
    formula: "",
    body: "",
  });

  function addCard() {
    if (!draft.title.trim() || !draft.body.trim()) return;
    setCards((prev) => [
      ...prev,
      { title: draft.title.trim(), formula: draft.formula.trim() || undefined, body: draft.body.trim() },
    ]);
    setDraft({ title: "", formula: "", body: "" });
  }

  function removeCard(i: number) {
    setCards((prev) => prev.filter((_, idx) => idx !== i));
  }

  function moveCard(i: number, dir: -1 | 1) {
    setCards((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  return (
    <div>
      <input type="hidden" name="theoryCards" value={JSON.stringify(cards)} />

      <label className="label">Карточки теории (минимум 1)</label>

      {cards.length > 0 && (
        <div className="mb-3 space-y-2">
          {cards.map((c, i) => (
            <div key={i} className="card flex items-start justify-between gap-3 p-3 text-sm">
              <div className="min-w-0">
                <p className="font-semibold text-ink">{c.title}</p>
                {c.formula && <p className="font-mono text-xs text-pine">{c.formula}</p>}
                <p className="mt-0.5 text-xs text-ink-soft">{c.body}</p>
              </div>
              <div className="flex shrink-0 gap-1.5 text-xs font-bold">
                <button type="button" onClick={() => moveCard(i, -1)} disabled={i === 0} className="text-ink-soft disabled:opacity-30">
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveCard(i, 1)}
                  disabled={i === cards.length - 1}
                  className="text-ink-soft disabled:opacity-30"
                >
                  ↓
                </button>
                <button type="button" onClick={() => removeCard(i)} className="text-coral hover:underline">
                  Убрать
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card space-y-2.5 p-3.5">
        <input
          className="input text-sm"
          placeholder="Заголовок карточки (например: Теорема Пифагора)"
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
        <input
          className="input text-sm"
          placeholder="Формула (необязательно, например: a²+b²=c²)"
          value={draft.formula}
          onChange={(e) => setDraft({ ...draft, formula: e.target.value })}
        />
        <textarea
          className="input min-h-[60px] resize-y text-sm"
          placeholder="Текст карточки — объяснение своими словами"
          value={draft.body}
          onChange={(e) => setDraft({ ...draft, body: e.target.value })}
        />
        <button type="button" onClick={addCard} className="btn-secondary !text-xs">
          + Добавить карточку
        </button>
      </div>

      {cards.length === 0 && (
        <p className="mt-2 text-xs text-coral">Добавьте хотя бы одну карточку теории перед сохранением.</p>
      )}
    </div>
  );
}
