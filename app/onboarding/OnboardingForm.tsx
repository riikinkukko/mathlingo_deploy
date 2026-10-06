"use client";

import { useState } from "react";
import { saveOnboardingAction } from "@/app/actions";
import { TARGET_SCORE_RANGES } from "@/lib/curriculum-recommendations";

export default function OnboardingForm({ topics }: { topics: { id: string; title: string }[] }) {
  const [targetScore, setTargetScore] = useState<number | null>(null);
  const [topicId, setTopicId] = useState<string | null>(null);

  return (
    <form action={saveOnboardingAction} className="space-y-6">
      <input type="hidden" name="targetScore" value={targetScore ?? ""} />
      <input type="hidden" name="topicId" value={topicId ?? ""} />

      <div>
        <p className="mb-2 text-sm font-bold text-ink">Какая цель по баллам ЕГЭ?</p>
        <p className="mb-3 text-xs text-ink-soft">
          Подскажем разумный темп занятий под твою цель.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {TARGET_SCORE_RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setTargetScore(r.value)}
              className={`rounded-xl border-2 py-2.5 text-sm font-extrabold transition ${
                targetScore === r.value
                  ? "border-pine bg-pine-light text-pine-dark"
                  : "border-line text-ink-soft hover:border-pine"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {topics.length > 1 && (
        <div>
          <p className="mb-2 text-sm font-bold text-ink">С чего начнём?</p>
          <p className="mb-3 text-xs text-ink-soft">
            Выбери тему, которую хочешь подтянуть первой. Сменить можно в любой момент в «Предметах».
          </p>
          <div className="grid grid-cols-2 gap-2">
            {topics.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={topicId === t.id}
                onClick={() => setTopicId(t.id)}
                className={`min-h-[44px] rounded-xl border-2 px-2 py-2 text-[13px] font-extrabold leading-tight transition ${
                  topicId === t.id
                    ? "border-pine bg-pine-light text-pine-dark"
                    : "border-line text-ink-soft hover:border-pine"
                }`}
              >
                {t.title}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label htmlFor="dreamUniversity" className="mb-2 block text-sm font-bold text-ink">
          Куда хочешь поступить? <span className="font-semibold text-ink-soft">(необязательно)</span>
        </label>
        <input
          id="dreamUniversity"
          name="dreamUniversity"
          maxLength={120}
          className="input"
          placeholder="Например: МГУ, ВМК"
        />
        <p className="mt-1.5 text-xs text-ink-soft">Покажем, сколько дней до ЕГЭ и сколько заниматься в день.</p>
      </div>

      <div className="flex items-center justify-between pt-2">
        <a href="/student" className="text-sm font-bold text-ink-soft hover:text-pine hover:underline">
          Пропустить
        </a>
        <button type="submit" className="btn-primary !px-8">
          Продолжить
        </button>
      </div>
    </form>
  );
}
