import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import {
  getHomeworksForStudent,
  homeworkStatus,
  isStandaloneStudent,
} from "@/lib/queries";
import StudentShell from "@/components/StudentShell";
import FractionBadge from "@/components/FractionBadge";
import Mascot from "@/components/Mascot";
import { IconClipboard, IconCheck } from "@/components/icons";

const KIND_META: Record<string, { label: string; bg: string }> = {
  homework: { label: "Домашнее задание", bg: "bg-amber" },
  test: { label: "Контрольная работа", bg: "bg-violet" },
  exam: { label: "Пробный экзамен", bg: "bg-coral" },
};

export default async function HomeworkListPage() {
  const user = (await getSessionUser())!;
  const homeworks = await getHomeworksForStudent(user.id);
  if (isStandaloneStudent(user) && !homeworks.some((hw) => hw.studentId === user.id)) redirect("/student/mock");
  const statusPairs = await Promise.all(homeworks.map(async (hw) => [hw.id, await homeworkStatus(hw, user.id)] as const));
  const statusById = new Map(statusPairs);

  const tabLabel = "Домашнее задание";

  return (
    <StudentShell active="homework" title={tabLabel}>
      <div className="px-4 py-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <a
          href="/student/mock"
          className="mb-4 flex items-center gap-3 rounded-2xl border border-line-soft bg-white p-4 transition hover:border-pine"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-pine-light text-lg" aria-hidden>
            ⏱
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[15px] font-black text-ink">Пробники ЕГЭ</span>
            <span className="block text-[13px] text-ink-soft">20 заданий в формате экзамена, баллы по шкале ЕГЭ</span>
          </span>
          <span className="text-sm font-black text-pine">Открыть</span>
        </a>
        {homeworks.length === 0 ? (
          <div className="card p-10 text-center">
            <Mascot mood="idle" size={72} className="mx-auto mb-3" />
            <p className="font-display text-lg font-black text-ink">
              Пока нет заданий
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              Домашка, контрольные и пробники от репетитора появятся здесь.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {homeworks.map((hw) => {
              const st = statusById.get(hw.id)!;
              const meta = KIND_META[hw.kind] ?? KIND_META.homework;
              const due = new Date(hw.dueDate).toLocaleDateString("ru-RU", {
                timeZone: "Europe/Moscow",
                day: "numeric",
                month: "long",
              });
              return (
                <a
                  key={hw.id}
                  href={`/student/homework/${hw.id}`}
                  className="card flex items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <span
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white ${
                      st.complete ? "bg-pine" : st.overdue ? "bg-coral" : meta.bg
                    }`}
                  >
                    <IconClipboard className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="mb-0.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">
                      {meta.label}
                      {hw.audience === "pro_standalone" && " · авторский"}
                    </p>
                    <p className="line-clamp-2 break-words font-display text-base font-black text-ink">{hw.title}</p>
                    <p
                      className={`mt-0.5 text-xs font-bold ${
                        st.overdue ? "text-coral" : st.complete ? "text-pine" : "text-ink-soft"
                      }`}
                    >
                      {st.complete ? "Выполнено" : st.overdue ? "Просрочено · срок был " : "Сдать до "}
                      {!st.complete && due}
                    </p>
                  </div>
                  {st.complete ? (
                    <IconCheck className="h-6 w-6 shrink-0 text-pine" />
                  ) : (
                    <FractionBadge solved={st.done} total={st.total} size="sm" />
                  )}
                </a>
              );
            })}
          </div>
        )}
      </div>
      </div>
    </StudentShell>
  );
}
