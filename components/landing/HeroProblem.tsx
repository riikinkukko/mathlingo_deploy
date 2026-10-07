"use client";

import { useRef, useState } from "react";
import Mascot from "@/components/Mascot";
import { ymGoal } from "@/lib/ym";

type State = "idle" | "wrong" | "right";

/**
 * Живая задача №1 прямо на первом экране: посетитель решает её и видит,
 * как отвечает приложение. Верный ответ «проверяет» красная ручка
 * репетитора — единственная оркестрованная анимация на странице.
 */
export default function HeroProblem({ moreCount = 0 }: { moreCount?: number }) {
  const [value, setValue] = useState("");
  const [state, setState] = useState<State>("idle");
  const [tries, setTries] = useState(0);
  const [showSolution, setShowSolution] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function check(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(value.replace(",", ".").replace(/[^\d.\-]/g, ""));
    if (!value.trim()) {
      inputRef.current?.focus();
      return;
    }
    if (n === 60) {
      setState("right");
      ymGoal("landing_problem_solved");
    } else {
      setState("wrong");
      setTries((t) => t + 1);
    }
  }

  const right = state === "right";

  return (
    <div className="relative mx-auto w-full max-w-[460px]">
      {/* Лист тетради: клетка и красное поле справа, как в обычной тетради */}
      <div className="lp-sheet relative overflow-hidden rounded-[22px] border border-line bg-white px-5 pb-5 pt-4 shadow-[0_24px_48px_-28px_rgba(12,61,40,0.45)] sm:px-6">
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-7 w-px bg-coral/50" />

        <p className="relative text-[13px] font-extrabold text-pine-dark">Задача №1 из ЕГЭ</p>
        <p className="relative mt-1 pr-6 text-[17px] font-bold leading-snug text-ink">
          В треугольнике ABC угол A равен 50°, угол B равен 70°. Найдите угол C.
        </p>

        <div className="relative mt-2 h-[150px] sm:h-[170px]">
          <svg viewBox="0 0 220 158" className="h-full w-full" role="img" aria-label="Треугольник ABC: угол A 50°, угол B 70°, угол C неизвестен">
            <polygon points="35,138 185,138 139.6,13.3" fill="#E3F6EC" stroke="#12583A" strokeWidth="2.2" strokeLinejoin="round" />
            {/* дуги углов — углы на чертеже настоящие: 50°, 70°, 60° */}
            <path d="M 61 138 A 26 26 0 0 0 51.7 118.1" fill="none" stroke="#12583A" strokeWidth="1.8" />
            <path d="M 163 138 A 22 22 0 0 1 177.5 117.3" fill="none" stroke="#12583A" strokeWidth="1.8" />
            <path d="M 126.75 28.6 A 20 20 0 0 0 146.4 32.1" fill="none" stroke={right ? "#F0555A" : "#F0A93C"} strokeWidth="2.2" />
            <text x="22" y="154" className="fill-ink text-[14px] font-black">A</text>
            <text x="188" y="154" className="fill-ink text-[14px] font-black">B</text>
            <text x="135" y="10" className="fill-ink text-[14px] font-black" dominantBaseline="auto">C</text>
            <text x="66" y="131" className="fill-pine-dark text-[12px] font-extrabold">50°</text>
            <text x="142" y="131" className="fill-pine-dark text-[12px] font-extrabold">70°</text>
            <text
              x={right ? 128 : 134}
              y="57"
              className={right ? "fill-coral" : "fill-amber text-[15px] font-black"}
              style={right ? { fontFamily: "Caveat, cursive", fontSize: 21, fontWeight: 700 } : undefined}
            >
              {right ? "60°" : "?"}
            </text>
          </svg>
        </div>

        <form onSubmit={check} className="relative mt-2 flex items-center gap-2">
          <label htmlFor="lp-answer" className="sr-only">
            Ответ в градусах
          </label>
          <div className="relative flex-1">
            <input
              id="lp-answer"
              ref={inputRef}
              inputMode="numeric"
              autoComplete="off"
              value={value}
              disabled={right}
              onChange={(e) => {
                setValue(e.target.value.slice(0, 6));
                if (state === "wrong") setState("idle");
              }}
              placeholder="Ответ"
              className={`h-12 w-full rounded-2xl border-2 bg-white px-4 text-[18px] font-black text-ink placeholder:font-bold placeholder:text-ink-soft/50 focus:outline-none ${
                state === "wrong" ? "animate-shake border-coral" : right ? "border-pine" : "border-line focus:border-pine"
              }`}
            />
            {right && (
              <svg aria-hidden viewBox="0 0 120 56" className="lp-ink pointer-events-none absolute -left-3 -top-2 h-16 w-32">
                <path
                  d="M 14 30 C 10 10, 70 4, 104 16 C 122 24, 110 48, 64 50 C 30 52, 6 44, 12 26"
                  fill="none"
                  stroke="#F0555A"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  pathLength={1}
                />
              </svg>
            )}
          </div>
          {!right && (
            <button
              type="submit"
              className="h-12 shrink-0 rounded-2xl bg-pine px-5 text-[15px] font-black text-white shadow-[0_3px_0_#0E5E3A] transition hover:bg-pine-dark active:translate-y-px active:shadow-none"
            >
              Проверить
            </button>
          )}
          {right && (
            <span className="lp-pop shrink-0 font-hand text-[30px] font-bold leading-none text-coral" style={{ animationDelay: "0.55s" }}>
              Верно!
            </span>
          )}
        </form>

        <div aria-live="polite" className="relative min-h-[28px]">
          {state === "wrong" && (
            <p className="mt-2 font-hand text-[22px] font-bold leading-tight text-coral">
              {tries > 1 ? "Подсказка: 180° − 50° − 70°" : "Почти. Сумма углов треугольника — 180°"}
            </p>
          )}
          {right && (
            <p className="lp-pop mt-2 font-hand text-[22px] font-bold leading-tight text-coral" style={{ animationDelay: "0.9s" }}>
              180° − 50° − 70° = 60°. Так и решают №1.
            </p>
          )}
          {state === "idle" && !right && (
            <button
              type="button"
              onClick={() => setShowSolution((v) => !v)}
              className="mt-2 text-[13px] font-bold text-ink-soft underline decoration-dotted underline-offset-4 hover:text-pine-dark"
            >
              {showSolution ? "Скрыть подсказку" : "Не помню, как решать"}
            </button>
          )}
          {state === "idle" && showSolution && (
            <p className="mt-1 font-hand text-[22px] font-bold leading-tight text-coral">Сумма углов треугольника — 180°</p>
          )}
        </div>
      </div>

      {right && (
        <div className="lp-pop mt-4 flex items-center gap-3 rounded-[20px] bg-pine-darker p-3 pr-4 text-white" style={{ animationDelay: "1.2s" }}>
          <Mascot mood="celebrating" size={64} float={false} />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-black leading-tight">
              {moreCount > 0 ? `Ещё ${moreCount.toLocaleString("ru-RU")}+ задач` : "Ещё сотни задач"} — от №1 до задач с параметром
            </p>
            <a
              href="/register"
              onClick={() => ymGoal("landing_cta_student")}
              className="lp-btn mt-2 inline-flex h-10 items-center rounded-xl bg-white px-4 text-[14px] font-black text-pine-darker hover:bg-pine-light"
            >
              Решать дальше бесплатно
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
