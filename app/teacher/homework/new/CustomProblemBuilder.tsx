"use client";

import { useState } from "react";

export interface DraftProblem {
  text: string;
  answerType: "NUMBER" | "DETAILED";
  correctAnswer: string;
  hint: string;
  explanation: string;
}

const EMPTY: DraftProblem = { text: "", answerType: "NUMBER", correctAnswer: "", hint: "", explanation: "" };

export default function CustomProblemBuilder() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DraftProblem>(EMPTY);
  const [added, setAdded] = useState<DraftProblem[]>([]);

  function addDraft() {
    if (!draft.text.trim() || !draft.correctAnswer.trim()) return;
    setAdded((prev) => [...prev, draft]);
    setDraft(EMPTY);
    setOpen(false);
  }

  function removeDraft(i: number) {
    setAdded((prev) => prev.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <input type="hidden" name="customProblems" value={JSON.stringify(added)} />

      <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-ink-soft">
        Свои задачи (необязательно)
      </p>

      {added.length > 0 && (
        <div className="mb-3 space-y-2">
          {added.map((p, i) => (
            <div key={i} className="card flex items-start justify-between gap-3 p-3 text-sm">
              <div className="min-w-0">
                <p className="text-ink">{p.text}</p>
                <p className="mt-0.5 text-[11px] text-ink-soft">
                  {p.answerType === "DETAILED" ? "Развёрнутый ответ" : `Ответ: ${p.correctAnswer}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeDraft(i)}
                className="shrink-0 text-xs font-bold text-coral hover:underline"
              >
                Убрать
              </button>
            </div>
          ))}
        </div>
      )}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn-secondary !text-xs"
        >
          + Написать свою задачу
        </button>
      ) : (
        <div className="card space-y-3 p-4">
          <div>
            <label className="label">Текст задачи</label>
            <textarea
              className="input min-h-[70px] resize-y text-sm"
              value={draft.text}
              onChange={(e) => setDraft({ ...draft, text: e.target.value })}
              placeholder="Например: Найдите площадь треугольника со сторонами 6, 8, 10."
            />
          </div>

          <div className="flex gap-2">
            <label className="flex items-center gap-1.5 text-xs font-bold text-ink-soft">
              <input
                type="radio"
                checked={draft.answerType === "NUMBER"}
                onChange={() => setDraft({ ...draft, answerType: "NUMBER" })}
                className="accent-pine"
              />
              Короткий ответ (число)
            </label>
            <label className="flex items-center gap-1.5 text-xs font-bold text-ink-soft">
              <input
                type="radio"
                checked={draft.answerType === "DETAILED"}
                onChange={() => setDraft({ ...draft, answerType: "DETAILED" })}
                className="accent-pine"
              />
              Развёрнутое решение
            </label>
          </div>

          <div>
            <label className="label">
              {draft.answerType === "DETAILED" ? "Эталонное решение (для проверки)" : "Правильный ответ"}
            </label>
            <input
              className="input text-sm"
              value={draft.correctAnswer}
              onChange={(e) => setDraft({ ...draft, correctAnswer: e.target.value })}
              placeholder={draft.answerType === "DETAILED" ? "Краткое верное решение с обоснованием" : "Например: 24"}
            />
          </div>

          <div>
            <label className="label">Подсказка (необязательно)</label>
            <input
              className="input text-sm"
              value={draft.hint}
              onChange={(e) => setDraft({ ...draft, hint: e.target.value })}
              placeholder="Показывается ученику при неверном ответе"
            />
          </div>

          <div>
            <label className="label">Разбор решения (необязательно)</label>
            <textarea
              className="input min-h-[60px] resize-y text-sm"
              value={draft.explanation}
              onChange={(e) => setDraft({ ...draft, explanation: e.target.value })}
              placeholder="Показывается ученику после правильного ответа"
            />
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={addDraft} className="btn-primary !text-xs">
              Добавить в задание
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setDraft(EMPTY);
              }}
              className="btn-secondary !text-xs"
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
