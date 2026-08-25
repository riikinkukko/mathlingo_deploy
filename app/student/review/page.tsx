import { getSessionUser } from "@/lib/auth";
import { getDueReviewProblems, toPublicProblem } from "@/lib/queries";
import StudentShell from "@/components/StudentShell";
import ReviewFlow from "@/components/ReviewFlow";
import Mascot from "@/components/Mascot";

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: { topic?: string };
}) {
  const user = (await getSessionUser())!;
  const due = await getDueReviewProblems(user.id);

  const items = due.map((d) => ({
    problem: toPublicProblem(d.problem),
    skillTitle: d.skillTitle,
    box: d.box,
  }));

  // Повторение может смешивать задачи из РАЗНЫХ тем сразу (SRS не
  // привязан к одной конкретной теме, в отличие от обычного урока) —
  // поэтому нет единственно верной темы для возврата. Используем ту,
  // с дашборда которой ученик открыл повторение (если передана через
  // ?topic= — см. app/student/page.tsx), иначе — общий дашборд.
  const backHref = searchParams.topic ? `/student?topic=${searchParams.topic}` : "/student";

  // Пусто — обычная навигационная страница, с сайдбаром/таб-баром.
  if (items.length === 0) {
    return (
      <StudentShell active="review" title="Повторение">
        <div className="px-4 py-6 lg:px-8">
          <div className="mx-auto max-w-2xl">
            <div className="card p-10 text-center">
              <Mascot mood="idle" size={72} className="mx-auto mb-3" />
              <p className="font-display text-lg font-black text-ink">Повторять пока нечего</p>
              <p className="mt-1 text-sm text-ink-soft">
                Решённые задачи появятся здесь через некоторое время — так работает
                интервальное повторение: чем лучше вы помните задачу, тем реже она
                возвращается.
              </p>
              <a href={backHref} className="btn-primary mt-5 inline-block !text-sm">
                К пути обучения
              </a>
            </div>
          </div>
        </div>
      </StudentShell>
    );
  }

  // Есть что повторять — сфокусированный режим без сайдбара/таб-бара, как
  // на экране самой задачи (ReviewFlow сам рисует упрощённую шапку).
  return (
    <div className="min-h-screen bg-paper px-4 pb-16 pt-[max(1rem,var(--safe-area-inset-top,env(safe-area-inset-top)))]">
      <ReviewFlow items={items} backHref={backHref} />
    </div>
  );
}
