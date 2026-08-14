import { getSessionUser } from "@/lib/auth";
import { getDueReviewProblems, computeXp, computeStreak } from "@/lib/queries";
import { toPublicProblem } from "@/lib/queries";
import { pluralRu } from "@/lib/pluralize";
import AppHeader from "@/components/AppHeader";
import ReviewFlow from "@/components/ReviewFlow";
import Mascot from "@/components/Mascot";

export default async function ReviewPage() {
  const user = (await getSessionUser())!;
  const xp = await computeXp(user.id);
  const streak = await computeStreak(user.id);
  const due = await getDueReviewProblems(user.id);

  const items = due.map((d) => ({
    problem: toPublicProblem(d.problem),
    skillTitle: d.skillTitle,
    box: d.box,
  }));

  return (
    <div className="min-h-screen pb-16">
      <AppHeader
        user={user}
        gamification={{ xp, streak }}
        crumbs={[{ label: "Путь обучения", href: "/student" }, { label: "Повторение" }]}
      />
      <main className="mx-auto max-w-2xl px-4">
        {items.length === 0 ? (
          <div className="card p-10 text-center">
            <Mascot mood="idle" size={72} className="mx-auto mb-3" />
            <p className="font-display text-lg font-black text-ink">Повторять пока нечего</p>
            <p className="mt-1 text-sm text-ink-soft">
              Решённые задачи появятся здесь через некоторое время — так работает
              интервальное повторение: чем лучше вы помните задачу, тем реже она
              возвращается.
            </p>
            <a href="/student" className="btn-primary mt-5 inline-block !text-sm">
              К пути обучения
            </a>
          </div>
        ) : (
          <>
            <h1 className="mb-1 font-display text-2xl font-black text-ink">Повторение</h1>
            <p className="mb-6 text-sm text-ink-soft">
              {items.length} {pluralRu(items.length, ["задача", "задачи", "задач"])} —{" "}
              {pluralRu(items.length, ["решённая ранее", "решённые ранее", "решённые ранее"])}, самое время
              освежить в памяти.
            </p>
            <ReviewFlow items={items} />
          </>
        )}
      </main>
    </div>
  );
}
