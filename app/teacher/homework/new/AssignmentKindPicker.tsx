"use client";

import { useState } from "react";

export default function AssignmentKindPicker() {
  const [kind, setKind] = useState<"homework" | "test" | "exam">("homework");
  const [allowHints, setAllowHints] = useState(true);

  function selectKind(next: "homework" | "test" | "exam") {
    setKind(next);
    // Для контрольных/пробников по умолчанию выключаем подсказки —
    // ближе к реальным условиям экзамена. Учитель может включить вручную.
    setAllowHints(next === "homework");
  }

  return (
    <>
      <div>
        <label className="label">Тип задания</label>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { v: "homework", label: "Домашка", hint: "с подсказками" },
              { v: "test", label: "Контрольная", hint: "без подсказок" },
              { v: "exam", label: "Пробник", hint: "без подсказок" },
            ] as const
          ).map((opt) => (
            <label
              key={opt.v}
              className={`card flex cursor-pointer flex-col items-center gap-1 p-3 text-center text-sm ${
                kind === opt.v ? "border-pine bg-pine-light/40" : ""
              }`}
            >
              <input
                type="radio"
                name="kind"
                value={opt.v}
                checked={kind === opt.v}
                onChange={() => selectKind(opt.v)}
                className="accent-pine"
              />
              <span className="font-bold text-ink">{opt.label}</span>
              <span className="text-[11px] text-ink-soft">{opt.hint}</span>
            </label>
          ))}
        </div>
      </div>

      <label className="card flex cursor-pointer items-center gap-3 p-3.5 text-sm">
        <input
          type="checkbox"
          name="allowHints"
          checked={allowHints}
          onChange={(e) => setAllowHints(e.target.checked)}
          className="h-4 w-4 accent-pine"
        />
        <span>
          <span className="font-bold text-ink">Разрешить подсказки и разбор</span>
          <span className="block text-xs text-ink-soft">
            Для контрольных и пробников по умолчанию выключено — ближе к реальным условиям экзамена.
          </span>
        </span>
      </label>
    </>
  );
}
