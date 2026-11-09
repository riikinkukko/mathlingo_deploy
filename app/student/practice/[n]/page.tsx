import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { toPublicProblem } from "@/lib/queries";
import { EXAM_TASK_COUNT, getNumberPractice } from "@/lib/practice";
import ReviewFlow from "@/components/ReviewFlow";
import StudentShell from "@/components/StudentShell";
import Mascot from "@/components/Mascot";

/** «Тренировка по номеру ЕГЭ» — открывается с карты экзамена (lib/practice.ts). */
export default async function NumberPracticePage(props: { params: Promise<{ n: string }> }) {
  const { n: raw } = await props.params;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > EXAM_TASK_COUNT) notFound();
  const user = (await getSessionUser())!;
  const { items, total, locked } = await getNumberPractice(user, n);

  if (items.length === 0) {
    const reason =
      total === 0
        ? n >= 14
          ? "Это задание второй части — его решают с развёрнутым ответом. Тренируй его в уроках и пробниках."
          : "Задачи этого номера скоро появятся."
        : locked > 0
          ? "Задачи этого номера открываются в Pro."
          : "Задач для тренировки пока нет.";
    return (
      <StudentShell active="profile" title={`Задание №${n}`} back={{ href: "/student/profile", label: "Назад" }}>
        <div className="px-4 py-10 lg:px-8">
          <div className="card mx-auto max-w-md p-6 text-center">
            <Mascot mood="thinking" size={72} float={false} className="mx-auto" />
            <p className="mt-3 font-display text-lg font-black text-ink">Задание №{n}</p>
            <p className="mt-1 text-sm text-ink-soft">{reason}</p>
            {locked > 0 && total > 0 && (
              <a href="/student/upgrade" className="btn-primary mt-4 inline-block !text-sm">
                Подробнее о Pro
              </a>
            )}
          </div>
        </div>
      </StudentShell>
    );
  }

  return (
    <div className="min-h-screen bg-paper px-4 pb-16 pt-[max(1rem,var(--app-sat))]">
      <ReviewFlow
        mode="practice"
        title={`Задание №${n}`}
        backHref="/student/profile"
        items={items.map((it) => ({ problem: toPublicProblem(it.problem), skillTitle: it.skillTitle, box: 1 }))}
      />
    </div>
  );
}
