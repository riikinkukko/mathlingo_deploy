"use client";

import { useState } from "react";
import { saveOnboardingAction } from "@/app/actions";
import { TARGET_SCORE_RANGES } from "@/lib/curriculum-recommendations";

export default function OnboardingForm() {
  const [targetScore, setTargetScore] = useState<number | null>(null);

  return (
    <form action={saveOnboardingAction} className="space-y-6">
      <input type="hidden" name="targetScore" value={targetScore ?? ""} />

      <div>
        <p className="mb-2 text-sm font-bold text-ink">Какая цель по баллам ЕГЭ?</p>
        <p className="mb-3 text-xs text-ink-soft">
          Подскажем разумный темп занятий под вашу цель.
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
