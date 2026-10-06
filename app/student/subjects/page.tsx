import { getSessionUser } from "@/lib/auth";
import { getCurriculum, computeStudentProgress, getPathStates } from "@/lib/queries";
import StudentShell from "@/components/StudentShell";
import { pluralRu } from "@/lib/pluralize";
import { cookies } from "next/headers";
import { TOPIC_COOKIE } from "@/lib/topic-cookie";

// Заглушки будущих разделов — без записи в БД, реального контента там пока
// нет, это витрина того, что впереди по программе профильного ЕГЭ.
const UPCOMING_SUBJECTS: { title: string; icon: string; colorClass: string }[] = [
  { title: "Задачи на теорию чисел", icon: "🔢", colorClass: "bg-teal-light text-teal-text" },
];

export default async function SubjectsPage() {
  const user = (await getSessionUser())!;
  const curriculum = await getCurriculum();
  const progress = await computeStudentProgress(user.id);
  // Текущий предмет — тот, что открыт на «Пути» (по умолчанию первый).
  const savedTopicId = cookies().get(TOPIC_COOKIE)?.value;
  const currentId = (curriculum.find((t) => t.topic.id === savedTopicId) ?? curriculum[0])?.topic.id;

  return (
    <StudentShell active="subjects" title="Предметы">
      <div className="px-4 py-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <h1 className="font-display text-2xl font-black text-ink">Программа подготовки к ЕГЭ</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            Выбери раздел — он откроется на «Пути». Готовы все разделы
            профильной математики, кроме последнего — он скоро.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {curriculum.map(({ topic, chapters }) => {
              const allSkills = chapters.flatMap((c) => c.skills);
              const pathStates = getPathStates(allSkills, progress);
              const doneCount = allSkills.filter((s) => pathStates[s.id] === "done").length;
              const pct = allSkills.length ? Math.round((doneCount / allSkills.length) * 100) : 0;

              const current = topic.id === currentId;
              const started = doneCount > 0 || allSkills.some((s) => (progress[s.id]?.pct ?? 0) > 0);
              // Тёмная карточка — только у текущего раздела, остальные светлые:
              // раньше 11 одинаковых тёмных плашек сливались в одну стену.
              return (
                <a
                  key={topic.id}
                  href={`/student?topic=${topic.id}`}
                  aria-current={current ? "true" : undefined}
                  className={`rounded-2xl p-5 transition ${
                    current
                      ? "bg-pine-dark text-white hover:brightness-105"
                      : "border border-line-soft bg-white text-ink hover:border-pine"
                  }`}
                >
                  {(current || started) && (
                    <p className={`mb-1 text-[11px] font-black uppercase tracking-wide ${current ? "text-white/60" : "text-pine-dark"}`}>
                      {current ? "Сейчас изучаешь" : "Начат"}
                    </p>
                  )}
                  <p className="font-display text-lg font-black leading-tight">{topic.title}</p>
                  <div className={`mt-3 h-1.5 w-full overflow-hidden rounded-pill ${current ? "bg-white/20" : "bg-grid"}`}>
                    <div className="h-full rounded-pill bg-pine transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <p className={`mt-1.5 text-[12px] ${current ? "text-white/70" : "text-ink-soft"}`}>
                    {doneCount} из {allSkills.length} {pluralRu(allSkills.length, ["навыка", "навыков", "навыков"])} пройдено
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
