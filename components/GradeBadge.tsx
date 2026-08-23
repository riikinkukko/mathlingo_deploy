/**
 * Наглядная "оценка" вместо голой дроби "3/12" — по просьбе пользователя
 * (родителю/учителю сложнее на глаз понять, хорошо это или плохо, когда
 * знаменатель у каждого задания разный). Дробь никуда не исчезает —
 * доступна через title (hover-подсказка) и опционально текстом под
 * оценкой, если showFraction=true.
 *
 * Шкала намеренно простая и общепринятая (процент верных ответов):
 * 90-100% → 5 (отлично, pine)
 * 70-89%  → 4 (хорошо, teal)
 * 50-69%  → 3 (средне, amber)
 * 1-49%   → 2 (плохо, coral)
 * 0 задач или 0 решено — нейтральный прочерк, не оценка "2" (ещё не
 * начинал ≠ плохо справляется).
 */
export default function GradeBadge({
  solved,
  total,
  size = "md",
  showFraction = false,
}: {
  solved: number;
  total: number;
  size?: "sm" | "md";
  showFraction?: boolean;
}) {
  const pct = total > 0 ? Math.round((solved / total) * 100) : 0;

  let grade: string;
  let colorClass: string;
  let bgClass: string;
  if (total === 0 || solved === 0) {
    grade = "—";
    colorClass = "text-ink-soft";
    bgClass = "bg-grid";
  } else if (pct >= 90) {
    grade = "5";
    colorClass = "text-pine-dark";
    bgClass = "bg-pine-light";
  } else if (pct >= 70) {
    grade = "4";
    colorClass = "text-teal-dark";
    bgClass = "bg-teal-light";
  } else if (pct >= 50) {
    grade = "3";
    colorClass = "text-amber-dark";
    bgClass = "bg-amber-light";
  } else {
    grade = "2";
    colorClass = "text-coral-text";
    bgClass = "bg-coral-light";
  }

  const boxSize = size === "sm" ? "h-8 w-8 text-sm" : "h-10 w-10 text-base";

  return (
    <div className="inline-flex flex-col items-center gap-0.5" title={`Решено ${solved} из ${total} (${pct}%)`}>
      <span
        className={`flex ${boxSize} shrink-0 items-center justify-center rounded-xl font-display font-black ${colorClass} ${bgClass}`}
      >
        {grade}
      </span>
      {showFraction && (
        <span className="font-mono text-[10px] leading-none text-ink-soft">
          {solved}/{total}
        </span>
      )}
    </div>
  );
}
