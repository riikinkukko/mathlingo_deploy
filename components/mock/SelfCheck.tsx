"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setMockSelfScoreAction } from "@/app/actions-mock";
import type { Criterion } from "@/lib/ege-criteria";

/** Самопроверка задания второй части по критериям ФИПИ. */
export default function SelfCheck({
  mockId,
  problemId,
  criteria,
  initial,
}: {
  mockId: string;
  problemId: string;
  criteria: Criterion[];
  initial: number | null;
}) {
  const [score, setScore] = useState<number | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Уже оценено — показываем коротко, критерии раскрываются по кнопке.
  const [editing, setEditing] = useState(initial === null);
  const router = useRouter();

  function pick(points: number) {
    const prev = score;
    setScore(points);
    setError(null);
    start(async () => {
      const res = await setMockSelfScoreAction(mockId, problemId, points);
      if ("error" in res) {
        setScore(prev);
        setError(res.error);
      } else {
        setEditing(false);
        router.refresh();
      }
    });
  }

  if (!editing && score !== null) {
    const c = criteria.find((x) => x.points === score);
    return (
      <div className="mt-3 flex items-start gap-3 rounded-2xl bg-pine-light/60 p-3">
        <span className="font-display text-xl font-black text-pine-dark">{score}</span>
        <span className="min-w-0 flex-1 text-[13px] leading-snug text-ink">
          <span className="block font-black">Твоя оценка по критериям</span>
          {c?.text}
        </span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="shrink-0 text-[13px] font-black text-pine hover:underline"
        >
          Изменить
        </button>
      </div>
    );
  }

  return (
    <fieldset className="mt-3">
      <legend className="mb-1.5 text-[13px] font-black text-ink">
        Оцени своё решение по критериям ФИПИ {pending && <span className="font-bold text-ink-soft">· сохраняем…</span>}
      </legend>
      <div className="space-y-1.5">
        {criteria.map((c) => {
          const checked = score === c.points;
          return (
            <label
              key={c.points}
              className={`flex cursor-pointer gap-3 rounded-2xl border-2 p-3 transition ${
                checked ? "border-pine bg-pine-light/60" : "border-line-soft hover:border-line"
              }`}
            >
              <input
                type="radio"
                name={`self-${problemId}`}
                checked={checked}
                onChange={() => pick(c.points)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#12804F]"
              />
              <span className="w-6 shrink-0 font-display text-[15px] font-black text-ink">{c.points}</span>
              <span className="text-[13px] leading-snug text-ink">{c.text}</span>
            </label>
          );
        })}
      </div>
      {error && <p className="mt-1.5 text-sm font-bold text-coral">{error}</p>}
    </fieldset>
  );
}
