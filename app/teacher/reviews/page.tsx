import { getSessionUser } from "@/lib/auth";
import { getPendingReviewsForTeacher } from "@/lib/queries";
import { pluralRu } from "@/lib/pluralize";
import { maxPointsForTask } from "@/lib/ege-points";
import TeacherShell from "@/components/TeacherShell";
import PendingReviewCard from "@/app/teacher/student/[id]/PendingReviewCard";

export const dynamic = "force-dynamic";

/** «сегодня, 14:05» / «вчера, 9:30» / «12 окт, 18:00» — по Москве. */
function submittedLabel(iso: string): string {
  const d = new Date(iso);
  const key = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(x);
  const time = d.toLocaleTimeString("ru-RU", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit" });
  const today = key(new Date());
  const yesterday = key(new Date(Date.now() - 86_400_000));
  if (key(d) === today) return `сегодня, ${time}`;
  if (key(d) === yesterday) return `вчера, ${time}`;
  return `${d.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "short" })}, ${time}`;
}

/**
 * «Проверка решений» — очередь всех развёрнутых решений учеников этого
 * репетитора, старые сверху. Слева список, справа открытая работа (на телефоне —
 * по очереди: список → работа). После решения карточка сама открывает следующую.
 * Доступ: getPendingReviewsForTeacher берёт только своих учеников, а
 * reviewAttemptAction ещё раз проверяет владение перед сохранением.
 */
export default async function ReviewQueuePage(props: { searchParams: Promise<{ id?: string; done?: string }> }) {
  const searchParams = await props.searchParams;
  const user = (await getSessionUser())!;
  const queue = await getPendingReviewsForTeacher(user.id);
  const idx = searchParams.id ? queue.findIndex((r) => r.attemptId === searchParams.id) : -1;
  // На десктопе сразу открыта первая работа; на телефоне — только если выбрали.
  const current = idx >= 0 ? queue[idx] : queue[0];
  const curIdx = idx >= 0 ? idx : 0;
  const chosen = idx >= 0;
  const next = queue[curIdx + 1] ?? queue[curIdx - 1];
  const nextHref = next ? `/teacher/reviews?id=${next.attemptId}` : "/teacher/reviews?done=1";

  return (
    <TeacherShell active="reviews" title="Проверка решений">
      <main className="mx-auto max-w-3xl px-4 pb-8 pt-6 lg:max-w-[1280px]">
        <div className={`mb-5 ${chosen ? "hidden lg:block" : ""}`}>
          <h1 className="font-display text-2xl font-black text-ink">Проверка решений</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {queue.length > 0
              ? `${queue.length} ${pluralRu(queue.length, ["решение ждёт", "решения ждут", "решений ждут"])} проверки · сначала самые старые`
              : "Развёрнутые решения второй части от всех ваших учеников."}
          </p>
        </div>

        {queue.length === 0 ? (
          <div className="card flex flex-col items-center p-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-pine-light text-xl font-black text-pine-dark">✓</span>
            <p className="mt-3 font-display text-lg font-black text-ink">
              {searchParams.done ? "Готово — все решения проверены" : "Нечего проверять"}
            </p>
            <p className="mt-1 max-w-sm text-sm text-ink-soft">
              Когда ученик отправит развёрнутое решение задачи второй части, оно появится здесь.
            </p>
            <a href="/teacher" className="btn-secondary mt-5">
              К ученикам
            </a>
          </div>
        ) : (
          <div className="lg:grid lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start lg:gap-6">
            <ol className={`space-y-2 lg:sticky lg:top-6 lg:max-h-[calc(100vh-48px)] lg:overflow-y-auto lg:pr-1 ${chosen ? "hidden lg:block" : ""}`}>
              {queue.map((r) => {
                const active = current?.attemptId === r.attemptId;
                const n = r.problem.egeTaskNumber;
                return (
                  <li key={r.attemptId}>
                    <a
                      href={`/teacher/reviews?id=${r.attemptId}`}
                      aria-current={active ? "true" : undefined}
                      className={`flex items-center gap-3 rounded-[18px] border bg-white p-2.5 transition hover:border-pine ${
                        active ? "lg:border-2 lg:!border-pine-strong" : "border-line-soft"
                      }`}
                    >
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line-soft bg-paper">
                        {r.hasImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`/api/attempt-image/${r.attemptId}`} alt="" loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-[11px] font-black text-ink-soft">текст</span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-[15px] font-black text-ink">{r.student.name}</span>
                        <span className="block truncate text-[12px] text-ink-soft">
                          {n ? `№${n} · ` : ""}
                          {r.skillTitle}
                        </span>
                        <span className="block text-[11px] font-bold text-ink-soft">
                          {submittedLabel(r.submittedAt)} · до {maxPointsForTask(n)} б.
                        </span>
                      </span>
                      <span aria-hidden className="text-lg font-black text-ink-soft/60 lg:hidden">›</span>
                    </a>
                  </li>
                );
              })}
            </ol>

            {current && (
              <section className={chosen ? "" : "hidden lg:block"} aria-label="Открытая работа">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <a href="/teacher/reviews" className="text-[13px] font-bold text-ink-soft hover:text-pine-dark lg:hidden">
                    ← Все работы ({queue.length})
                  </a>
                  <p className="text-[13px] font-bold text-ink-soft">
                    Работа {curIdx + 1} из {queue.length} · отправлено {submittedLabel(current.submittedAt)}
                  </p>
                  <a href={`/teacher/student/${current.student.id}`} className="hidden text-[13px] font-bold text-pine-dark hover:underline lg:inline">
                    Карточка ученика →
                  </a>
                </div>
                {/* key — чтобы состояние карточки (баллы, комментарий) не переезжало на следующую работу. */}
                <PendingReviewCard key={current.attemptId} review={current} nextHref={nextHref} />
              </section>
            )}
          </div>
        )}
      </main>
    </TeacherShell>
  );
}
