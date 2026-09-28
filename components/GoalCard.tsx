import { MockScore } from "@/lib/types";
import { formatDateRu } from "@/lib/money";
import { pluralRu } from "@/lib/pluralize";

const POINTS: [string, string, string] = ["балл", "балла", "баллов"];

/**
 * Карточка «цель по ЕГЭ» на странице ученика: цель, последний пробник,
 * изменение к предыдущему, сколько осталось до цели и полоска прогресса.
 * mocks — уже отсортированы, новые сверху.
 */
export default function GoalCard({
  targetScore,
  mocks,
  readOnly = false,
}: {
  targetScore?: number;
  mocks: MockScore[];
  /** для родителя: без призывов «задать цель» и ссылок на формы */
  readOnly?: boolean;
}) {
  const last = mocks[0];
  const prev = mocks[1];
  const delta = last && prev ? last.score - prev.score : null;

  if (!targetScore && !last) {
    if (readOnly) return null;
    return (
      <div className="card mb-8 flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-bold text-ink">🎯 Цель по ЕГЭ не указана</p>
          <p className="mt-0.5 text-xs text-ink-soft">
            Задайте целевой балл и записывайте пробники — будет видно, сколько осталось до цели.
          </p>
        </div>
        <a href="#goal" className="text-sm font-bold text-pine hover:underline">
          Задать цель ↓
        </a>
      </div>
    );
  }

  const pct = targetScore && last ? Math.min(100, Math.round((last.score / targetScore) * 100)) : 0;
  const gap = targetScore && last ? targetScore - last.score : null;

  return (
    <div className="card mb-8 p-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">Цель по ЕГЭ</p>
          <p className="font-display text-2xl font-black text-ink">
            {targetScore ? `${targetScore} ${pluralRu(targetScore, POINTS)}` : "не указана"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">
            Последний пробник
          </p>
          {last ? (
            <p className="font-display text-2xl font-black text-ink">
              {last.score}
              {delta !== null && delta !== 0 && (
                <span className={`ml-1.5 text-sm font-bold ${delta > 0 ? "text-pine" : "text-coral"}`}>
                  {delta > 0 ? `↑ +${delta}` : `↓ ${delta}`}
                </span>
              )}
              <span className="ml-1.5 text-xs font-semibold text-ink-soft">{formatDateRu(last.takenAt)}</span>
            </p>
          ) : (
            <p className="text-sm text-ink-soft">ещё не было</p>
          )}
        </div>
      </div>

      {targetScore && last && (
        <>
          <div
            className="mt-3 h-2.5 overflow-hidden rounded-pill bg-line-soft"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Прогресс к цели"
          >
            <div
              className={`h-full rounded-pill ${gap !== null && gap <= 0 ? "bg-pine" : "bg-amber"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs font-semibold text-ink-soft">
            {gap !== null && gap > 0
              ? `До цели осталось ${gap} ${pluralRu(gap, POINTS)}`
              : "Цель достигнута на пробнике 🎉"}
          </p>
        </>
      )}
      {targetScore && !last && (
        <p className="mt-2 text-xs text-ink-soft">
          {readOnly
            ? "Пробников пока не было — прогресс к цели появится после первого."
            : "Запишите первый пробник — появится прогресс к цели."}
        </p>
      )}
    </div>
  );
}
