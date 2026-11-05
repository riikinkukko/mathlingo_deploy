import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import TeacherShell from "@/components/TeacherShell";
import PendingReviewCard from "@/app/teacher/student/[id]/PendingReviewCard";
import ReviewQueueButton from "@/components/review/ReviewQueueButton";
import { toReviewItem } from "@/lib/review-item";
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
  const items = queue.map((r) => {
    const w = waited(r.paidAt);
    return toReviewItem(r, { note: { text: w.label, late: w.late } });
  });

  return (
    <TeacherShell active="checks" title="Платные проверки">
      <main className="mx-auto max-w-3xl px-4 py-6 lg:max-w-4xl">
        <h1 className="font-display text-2xl font-black text-ink">Платные проверки</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Ученики без репетитора оплатили проверку развёрнутого решения. Обещанный срок — {PAID_REVIEW_DAYS} дня с момента оплаты.
        </p>
        <ReviewQueueButton items={items} className="mt-4 w-full sm:w-auto" />
        {queue.length === 0 ? (
          <p className="mt-8 text-center text-sm font-bold text-ink-soft">Очередь пуста — все решения проверены.</p>
        ) : (
          <div className="mt-6 space-y-4">
            {items.map((r) => (
              <div key={r.attemptId}>
                <p className={`mb-1.5 text-[12px] font-black ${r.note?.late ? "text-coral" : "text-ink-soft"}`}>{r.note?.text}</p>
                <PendingReviewCard review={r} queue={items} />
              </div>
            ))}
          </div>
        )}
      </main>
    </TeacherShell>
  );
}
