import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import StudentShell from "@/components/StudentShell";
import { getStudentChecks, PAID_REVIEW_DAYS } from "@/lib/paid-review";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; cls: string }> = {
  paid: { label: "На проверке", cls: "bg-amber-light text-amber" },
  approved: { label: "Засчитано", cls: "bg-pine-light text-pine-dark" },
  needs_revision: { label: "Есть что исправить", cls: "bg-coral-light text-coral" },
};

/** «Мои проверки»: решения, отправленные эксперту за плату, и результаты. */
export default async function StudentChecksPage({ searchParams }: { searchParams: { paid?: string } }) {
  const user = await getSessionUser();
  if (!user || user.role !== "STUDENT") redirect("/login");
  const checks = await getStudentChecks(user.id);

  return (
    <StudentShell active="profile" title="Мои проверки">
      <main className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="font-display text-2xl font-black text-ink">Мои проверки</h1>
        {searchParams.paid === "1" && (
          <p className="mt-3 rounded-2xl bg-pine-light px-4 py-3 text-[14px] font-bold text-pine-darker" role="status">
            Оплата прошла — решение у эксперта. Ответ придёт в течение {PAID_REVIEW_DAYS} дней, мы пришлём уведомление.
          </p>
        )}
        {checks.length === 0 ? (
          <p className="mt-6 text-sm text-ink-soft">
            Здесь появятся решения, которые ты отправишь на проверку эксперту. Кнопка «Отправить на проверку» — под эталонным решением
            после того, как решишь задачу второй части.
          </p>
        ) : (
          <div className="mt-5 space-y-3">
            {checks.map((c) => {
              const st = STATUS[c.status === "done" ? (c.decision ?? "approved") : c.status] ?? STATUS.paid;
              return (
                <article key={c.orderId} className="card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[12px] font-bold text-ink-soft">{c.skillTitle}</p>
                    <span className={`rounded-pill px-2.5 py-1 text-[11px] font-black ${st.cls}`}>{st.label}</span>
                  </div>
                  <p className="mt-2 line-clamp-3 text-[14px] font-semibold text-ink">{c.problemText}</p>
                  {c.status === "done" && c.feedback && (
                    <div className="mt-3 rounded-xl bg-paper p-3">
                      <p className="text-[11px] font-black text-ink-soft">Комментарий эксперта</p>
                      <p className="mt-1 whitespace-pre-wrap text-[14px] text-ink">{c.feedback}</p>
                    </div>
                  )}
                  {c.status === "done" && c.hasMarkup && (
                    <a href={`/api/attempt-image/${c.attemptId}?v=markup`} target="_blank" className="mt-3 block overflow-hidden rounded-xl border border-line">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/attempt-image/${c.attemptId}?v=markup`} alt="Решение с пометками эксперта" className="max-h-80 w-full object-contain" />
                    </a>
                  )}
                  {c.skillId && (
                    <a href={`/student/skill/${c.skillId}`} className="mt-3 inline-block text-[13px] font-bold text-pine-dark hover:underline">
                      Открыть урок
                    </a>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </main>
    </StudentShell>
  );
}
