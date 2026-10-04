import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import TeacherShell from "@/components/TeacherShell";
import PendingReviewCard from "@/app/teacher/student/[id]/PendingReviewCard";
import { getPaidReviewQueue, isReviewer, PAID_REVIEW_DAYS } from "@/lib/paid-review";

export const dynamic = "force-dynamic";

function waited(paidAt: string): { label: string; late: boolean } {
  const h = Math.floor((Date.now() - new Date(paidAt).getTime()) / 3_600_000);
  const late = h >= PAID_REVIEW_DAYS * 24 - 6;
  if (h < 1) return { label: "оплачено только что", late };
  if (h < 24) return { label: `ждёт ${h} ч`, late };
  return { label: `ждёт ${Math.floor(h / 24)} дн ${h % 24} ч`, late };
}

/** Очередь платных проверок для эксперта платформы (владелец или админ). */
export default async function PaidChecksPage() {
  const user = await getSessionUser();
  if (!user || !isReviewer(user)) redirect("/teacher");
  const queue = await getPaidReviewQueue();

  return (
    <TeacherShell active="students" title="Платные проверки">
      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="font-display text-2xl font-black text-ink">Платные проверки</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Ученики без репетитора оплатили проверку развёрнутого решения. Обещанный срок — {PAID_REVIEW_DAYS} дня с момента оплаты.
        </p>
        {queue.length === 0 ? (
          <p className="mt-8 text-center text-sm font-bold text-ink-soft">Очередь пуста — все решения проверены.</p>
        ) : (
          <div className="mt-6 space-y-4">
            {queue.map((r) => {
              const w = waited(r.paidAt);
              return (
                <div key={r.attemptId}>
                  <p className={`mb-1.5 text-[12px] font-black ${w.late ? "text-coral" : "text-ink-soft"}`}>{w.label}</p>
                  <PendingReviewCard review={r} />
                </div>
              );
            })}
          </div>
        )}
      </main>
    </TeacherShell>
  );
}
