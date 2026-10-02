/**
 * Карта экзамена на «Прогрессе»: клетка на каждый номер ЕГЭ. Статус считается
 * по банку задач: освоено — решено не меньше 5 задач номера (или все, если их
 * меньше), в процессе — решена хотя бы одна, скоро — задач этого номера в
 * приложении пока нет. Число номеров — EXAM_TASKS (сейчас 19, ЕГЭ-2026).
 */
const EXAM_TASKS = 19;
const MASTERED_MIN = 5;

export default function ExamMap({ rows }: { rows: { n: number; total: number; solved: number }[] }) {
  const byN = new Map(rows.map((r) => [r.n, r]));
  const cells = Array.from({ length: EXAM_TASKS }, (_, i) => {
    const n = i + 1;
    const r = byN.get(n);
    const status: "mastered" | "progress" | "todo" | "soon" = !r
      ? "soon"
      : r.solved >= Math.min(MASTERED_MIN, r.total)
        ? "mastered"
        : r.solved > 0
          ? "progress"
          : "todo";
    return { n, status, r };
  });
  const mastered = cells.filter((c) => c.status === "mastered").length;
  const cls = {
    mastered: "bg-pine-dark text-white",
    progress: "bg-pine-mint text-pine-darker",
    todo: "bg-grid text-ink-soft",
    soon: "border-[1.5px] border-dashed border-line bg-white text-ink-soft/70",
  } as const;
  const label = { mastered: "освоено", progress: "в процессе", todo: "не начато", soon: "скоро в приложении" } as const;

  return (
    <section className="rounded-[20px] border border-line-soft bg-white p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-[16px] font-black text-ink">Карта экзамена</h2>
        <span className="text-[12px] font-bold text-ink-soft">
          освоено {mastered} из {EXAM_TASKS}
        </span>
      </div>
      <ul className="mt-3 grid grid-cols-7 gap-1.5 sm:grid-cols-10">
        {cells.map((c) => (
          <li
            key={c.n}
            title={`№${c.n}: ${label[c.status]}${c.r ? ` · решено ${c.r.solved} из ${c.r.total}` : ""}`}
            aria-label={`Задание ${c.n}: ${label[c.status]}`}
            className={`flex h-9 items-center justify-center rounded-[10px] text-[13px] font-black ${cls[c.status]}`}
          >
            {c.n}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] font-bold text-ink-soft">
        {(["mastered", "progress", "todo", "soon"] as const).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={`h-3 w-3 rounded-[4px] ${cls[k]}`} />
            {label[k]}
          </span>
        ))}
      </div>
    </section>
  );
}
