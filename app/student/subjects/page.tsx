import { getSessionUser } from "@/lib/auth";
import { getCurriculum, computeStudentProgress, getPathStates } from "@/lib/queries";
import StudentShell from "@/components/StudentShell";

// Заглушки будущих разделов — без записи в БД, реального контента там пока
// нет, это витрина того, что впереди по программе профильного ЕГЭ.
const UPCOMING_SUBJECTS: { title: string; icon: string; colorClass: string }[] = [
  { title: "Стереометрия", icon: "📐", colorClass: "bg-teal-light text-teal-text" },
  { title: "Графики функций", icon: "📉", colorClass: "bg-violet-light text-violet-text" },
  { title: "Производная", icon: "∂", colorClass: "bg-amber-light text-amber-text" },
  { title: "Экономическая задача", icon: "💰", colorClass: "bg-coral-light text-coral-text" },
  { title: "Задачи с параметром", icon: "🔧", colorClass: "bg-pine-light text-pine-dark" },
  { title: "Задачи на теорию чисел", icon: "🔢", colorClass: "bg-teal-light text-teal-text" },
];

export default async function SubjectsPage() {
  const user = (await getSessionUser())!;
  const curriculum = await getCurriculum();
  const progress = await computeStudentProgress(user.id);

  return (
    <StudentShell active="subjects" title="Предметы">
      <div className="px-4 py-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <h1 className="font-display text-2xl font-black text-ink">Программа подготовки к ЕГЭ</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            Планиметрия уже доступна полностью. Остальные разделы профильной
            программы добавляются постепенно.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {curriculum.map(({ topic, chapters }) => {
              const allSkills = chapters.flatMap((c) => c.skills);
              const pathStates = getPathStates(allSkills, progress);
              const doneCount = allSkills.filter((s) => pathStates[s.id] === "done").length;
              const pct = allSkills.length ? Math.round((doneCount / allSkills.length) * 100) : 0;
              return (
                <a
                  key={topic.id}
                  href={`/student?topic=${topic.id}`}
                  className="rounded-2xl bg-pine-dark p-5 text-white transition hover:brightness-105"
                >
                  <p className="text-[11px] font-black uppercase tracking-wide text-white/60">
                    Доступно полностью
                  </p>
                  <p className="mt-1 font-display text-lg font-black">{topic.title}</p>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-pill bg-white/20">
                    <div className="h-full rounded-pill bg-pine transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1.5 text-[12px] text-white/70">
                    {doneCount} из {allSkills.length} навыков пройдено
                  </p>
                </a>
              );
            })}

            {UPCOMING_SUBJECTS.map((s) => (
              <div
                key={s.title}
                className="relative rounded-2xl border border-dashed border-line bg-white p-5 opacity-80"
              >
                <span
                  className={`absolute right-4 top-4 rounded-pill px-2 py-0.5 text-[10px] font-extrabold uppercase ${s.colorClass}`}
                >
                  скоро
                </span>
                <span className="text-2xl">{s.icon}</span>
                <p className="mt-2 font-display text-[15px] font-black leading-tight text-ink">{s.title}</p>
                <p className="mt-1 text-[12px] text-ink-soft">Добавим по мере готовности контента</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </StudentShell>
  );
}
