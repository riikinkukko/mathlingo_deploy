import { getSessionUser } from "@/lib/auth";
import StudentShell from "@/components/StudentShell";
import VariantPicker, { type VariantCard } from "@/components/mock/VariantPicker";
import LineChart, { type LinePoint } from "@/components/charts/LineChart";
import { autoFinishIfExpired, canOpenVariant, getActiveMock, listMockAttempts, mockAccess } from "@/lib/mock-queries";
import {
  MAX_PRIMARY,
  MOCK_MODES,
  MOCK_VARIANT_COUNT,
  SCALE_IS_ESTIMATE,
  formatDuration,
  isMockMode,
} from "@/lib/mock-exam";
import { isStandaloneStudent } from "@/lib/queries";

function dateLabel(d: Date | string) {
  return new Date(d).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "short" });
}

export default async function MockListPage() {
  const user = (await getSessionUser())!;
  const activeRaw = await getActiveMock(user.id);
  const active = activeRaw ? await autoFinishIfExpired(user, activeRaw) : undefined;
  const attempts = await listMockAttempts(user.id);
  const finished = attempts.filter((a) => a.finishedAt);
  const fullFinished = finished.filter((a) => a.mode !== "part1");
  const access = mockAccess(user);
  const standalone = isStandaloneStudent(user);

  const variants: VariantCard[] = Array.from({ length: MOCK_VARIANT_COUNT }, (_, i) => {
    const v = i + 1;
    const mine = attempts.filter((a) => a.variant === v);
    const best = mine
      .filter((a) => a.finishedAt && a.mode !== "part1" && a.testScore != null)
      .reduce<number | null>((m, a) => (m == null || a.testScore! > m ? a.testScore! : m), null);
    return { variant: v, locked: !canOpenVariant(user, v), best, tries: mine.length };
  });

  const chronological = [...fullFinished].reverse();
  const points: LinePoint[] = chronological.map((a, i) => ({
    x: chronological.length === 1 ? 0.5 : i / (chronological.length - 1),
    y: a.testScore ?? 0,
    axisLabel: dateLabel(a.finishedAt!),
    tooltipLabel: `вариант ${a.variant}, ${dateLabel(a.finishedAt!)}`,
    detail: a.part2Pending > 0 ? "вторая часть ещё на проверке" : `${a.primaryScore ?? 0} из ${MAX_PRIMARY} первичных`,
  }));
  const minScore = Math.min(...chronological.map((a) => a.testScore ?? 0), user.targetScore ?? 100);
  const yMin = Math.max(0, Math.floor((minScore - 10) / 10) * 10);
  const remainingSec = active?.deadlineAt && !active.finishedAt ? Math.max(0, (new Date(active.deadlineAt).getTime() - Date.now()) / 1000) : null;

  return (
    <StudentShell active="mock" title="Пробники">
      <div className="px-4 py-6 lg:px-8">
        <div className="mx-auto max-w-3xl space-y-6">
          <header>
            <h1 className="font-display text-2xl font-black text-ink">Пробники ЕГЭ</h1>
            <p className="mt-1.5 text-sm text-ink-soft">
              20 заданий в формате ЕГЭ-2027: бланк ответов, таймер на 3 часа 55 минут и перевод в 100-балльную шкалу.
              После сдачи — разбор каждого задания и время, которое ты на него потратил.
            </p>
          </header>

          {active && !active.finishedAt && (
            <section className="flex flex-wrap items-center gap-3 rounded-2xl bg-pine-dark p-4 text-white">
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg font-black">Вариант {active.variant} — не закончен</p>
                <p className="text-[13px] text-white/75">
                  {isMockMode(active.mode) ? MOCK_MODES[active.mode].title : ""}
                  {remainingSec != null ? ` · осталось ${formatDuration(remainingSec)}` : ""}
                  {` · ответов: ${Object.keys(active.answers).length} из ${active.items.length}`}
                </p>
              </div>
              <a href={`/student/mock/${active.id}`} className="btn-primary !bg-white !text-pine-dark">
                Продолжить
              </a>
            </section>
          )}

          {chronological.length > 0 && (
            <section className="rounded-[20px] border border-line-soft bg-white p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-[16px] font-black text-ink">Твои баллы</h2>
                {user.targetScore && (
                  <span className="text-[12px] font-bold text-ink-soft">пунктир — цель {user.targetScore}</span>
                )}
              </div>
              {chronological.length >= 2 ? (
                <div className="mt-2">
                  <LineChart
                    points={points}
                    yMin={yMin}
                    yMax={100}
                    yTicks={[yMin, Math.round((yMin + 100) / 2), 100]}
                    reference={user.targetScore ? { value: user.targetScore, label: `цель ${user.targetScore}` } : undefined}
                    ariaLabel={`Баллы за пробники: ${chronological.map((a) => `${dateLabel(a.finishedAt!)} — ${a.testScore}`).join(", ")}`}
                  />
                </div>
              ) : (
                <p className="mt-2 text-sm text-ink-soft">
                  Первый результат — {chronological[0].testScore} баллов. После второго пробника здесь появится график.
                </p>
              )}
            </section>
          )}

          <section>
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2 className="font-display text-lg font-black text-ink">Варианты</h2>
              {!access.all && (
                <a href="/student/upgrade" className="text-[13px] font-black text-amber-text hover:underline">
                  Все {MOCK_VARIANT_COUNT} вариантов — в Pro
                </a>
              )}
            </div>
            <VariantPicker variants={variants} upgradeHref="/student/upgrade" />
            <p className="mt-3 text-[12px] text-ink-soft">
              {SCALE_IS_ESTIMATE
                ? "Тестовый балл ориентировочный: официальную шкалу ЕГЭ-2027 опубликуют ближе к экзамену."
                : ""}
              {!standalone ? " Вторую часть проверит твой репетитор — по критериям ФИПИ." : ""}
            </p>
          </section>

          {finished.length > 0 && (
            <section>
              <h2 className="mb-3 font-display text-lg font-black text-ink">История</h2>
              <ul className="divide-y divide-line-soft overflow-hidden rounded-2xl border border-line-soft bg-white">
                {finished.map((a) => (
                  <li key={a.id}>
                    <a href={`/student/mock/${a.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-paper">
                      <span className="min-w-0 flex-1">
                        <span className="block font-black text-ink">Вариант {a.variant}</span>
                        <span className="block text-[12px] text-ink-soft">
                          {dateLabel(a.finishedAt!)} · {isMockMode(a.mode) ? MOCK_MODES[a.mode].title.toLowerCase() : ""}
                          {a.part2Pending > 0 ? " · вторая часть на проверке" : ""}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block font-display text-xl font-black text-ink">{a.testScore ?? 0}</span>
                        <span className="block text-[11px] font-bold text-ink-soft">
                          {a.mode === "part1" ? "за 1 часть" : "баллов"}
                        </span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </StudentShell>
  );
}
