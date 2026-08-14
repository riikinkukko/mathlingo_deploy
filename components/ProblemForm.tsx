"use client";

import { useState } from "react";
import { Problem } from "@/lib/types";
import DiagramRenderer from "./diagrams/DiagramRenderer";

export default function ProblemForm({
  action,
  skillId,
  problem,
}: {
  action: (formData: FormData) => void;
  skillId: string;
  problem?: Problem;
}) {
  const [answerType, setAnswerType] = useState<Problem["answerType"]>(problem?.answerType ?? "NUMBER");
  const [diagramText, setDiagramText] = useState(
    problem?.diagram ? JSON.stringify(problem.diagram, null, 2) : ""
  );
  let diagramPreview: Problem["diagram"] | null = null;
  let diagramError = false;
  if (diagramText.trim()) {
    try {
      diagramPreview = JSON.parse(diagramText);
    } catch {
      diagramError = true;
    }
  }

  return (
    <form action={action} className="space-y-4">
      {problem && <input type="hidden" name="id" value={problem.id} />}
      <input type="hidden" name="skillId" value={skillId} />

      <div>
        <label className="label" htmlFor="text">
          Текст задачи
        </label>
        <textarea
          className="input min-h-[80px] resize-y"
          id="text"
          name="text"
          required
          defaultValue={problem?.text}
          placeholder="Например: Найдите площадь треугольника со сторонами 6, 8, 10."
        />
      </div>

      <div className="flex gap-4">
        {(["NUMBER", "DETAILED"] as const).map((t) => (
          <label key={t} className="flex items-center gap-1.5 text-sm font-bold text-ink-soft">
            <input
              type="radio"
              name="answerType"
              value={t}
              checked={answerType === t}
              onChange={() => setAnswerType(t)}
              className="accent-pine"
            />
            {t === "DETAILED" ? "Развёрнутое решение" : "Короткий ответ (число)"}
          </label>
        ))}
      </div>

      <div>
        <label className="label" htmlFor="correctAnswer">
          {answerType === "DETAILED" ? "Эталонное решение" : "Правильный ответ"}
        </label>
        <input
          className="input"
          id="correctAnswer"
          name="correctAnswer"
          required
          defaultValue={problem?.correctAnswer}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="keyFormula">
            Формула-подсказка (необязательно)
          </label>
          <input className="input" id="keyFormula" name="keyFormula" defaultValue={problem?.keyFormula ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="egeTaskNumber">
            Номер задания ЕГЭ (необязательно)
          </label>
          <input
            className="input"
            id="egeTaskNumber"
            name="egeTaskNumber"
            type="number"
            defaultValue={problem?.egeTaskNumber ?? ""}
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="hints">
          Подсказки — по одной на строку, показываются по очереди при ошибках
        </label>
        <textarea
          className="input min-h-[70px] resize-y"
          id="hints"
          name="hints"
          defaultValue={problem?.hints.join("\n")}
          placeholder={"Первая подсказка — общая идея\nВторая — конкретнее"}
        />
      </div>

      <div>
        <label className="label" htmlFor="explanation">
          Разбор решения — показывается после верного ответа
        </label>
        <textarea
          className="input min-h-[70px] resize-y"
          id="explanation"
          name="explanation"
          required
          defaultValue={problem?.explanation}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="difficulty">
            Сложность
          </label>
          <select className="input" id="difficulty" name="difficulty" defaultValue={problem?.difficulty ?? 2}>
            <option value={1}>1 — просто</option>
            <option value={2}>2 — средне</option>
            <option value={3}>3 — сложно</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="tier">
            Где показывать
          </label>
          <select className="input" id="tier" name="tier" defaultValue={problem?.tier ?? "core"}>
            <option value="core">В уроке (core)</option>
            <option value="bank">Только в банке для ДЗ (bank)</option>
          </select>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="diagram">
          Диаграмма — JSON-спецификация (необязательно, см. примеры в существующих задачах)
        </label>
        <textarea
          className="input min-h-[80px] resize-y font-mono text-xs"
          id="diagram"
          name="diagram"
          value={diagramText}
          onChange={(e) => setDiagramText(e.target.value)}
          placeholder='{"kind":"triangleRight","a":"6","b":"8","c":"?"}'
        />
        {diagramError && (
          <p className="mt-1 text-xs text-coral">Некорректный JSON — при сохранении диаграмма будет пропущена.</p>
        )}
        {diagramPreview && !diagramError && (
          <div className="mt-2 h-40 w-56 rounded-xl border border-line bg-pine-light p-2">
            <DiagramRenderer spec={diagramPreview as any} />
          </div>
        )}
      </div>

      <button className="btn-primary" type="submit">
        {problem ? "Сохранить изменения" : "Создать задачу"}
      </button>
    </form>
  );
}
