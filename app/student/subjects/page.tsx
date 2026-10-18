import { getSessionUser } from "@/lib/auth";
import { getCurriculum, computeStudentProgress, getPathStates } from "@/lib/queries";
import StudentShell from "@/components/StudentShell";
import { pluralRu } from "@/lib/pluralize";
import { cookies } from "next/headers";
import { TOPIC_COOKIE } from "@/lib/topic-cookie";
import { topicIcon } from "@/lib/topic-icons";

export default async function SubjectsPage() {
  const user = (await getSessionUser())!;
  const curriculum = await getCurriculum();
  const progress = await computeStudentProgress(user.id);
  // Текущий предмет — тот, что открыт на «Пути» (по умолчанию первый).
  const savedTopicId = (await cookies()).get(TOPIC_COOKIE)?.value;
  const currentId = (curriculum.find((t) => t.topic.id === savedTopicId) ?? curriculum[0])?.topic.id;

  return (
    <StudentShell active="subjects" title="Предметы">
      <div className="px-4 py-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <h1 className="font-display text-2xl font-black text-ink">Программа подготовки к ЕГЭ</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            Выбери раздел — он откроется на «Пути». Здесь все разделы
            профильной математики, от первого задания до двадцатого.
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
                  <p className="font-display text-lg font-black leading-tight">
                    <span aria-hidden className="mr-2">{topicIcon(topic.title)}</span>
                    {topic.title}
                  </p>
                  <div className={`mt-3 h-1.5 w-full overflow-hidden rounded-pill ${current ? "bg-white/20" : "bg-grid"}`}>
                    <div className="h-full rounded-pill bg-pine transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <p className={`mt-1.5 text-[12px] ${current ? "text-white/70" : "text-ink-soft"}`}>
                    {doneCount} из {allSkills.length} {pluralRu(allSkills.length, ["навыка", "навыков", "навыков"])} пройдено
                  </p>
                </a>
              );
            })}

          </div>
        </div>
      </div>
    </StudentShell>
  );
}
