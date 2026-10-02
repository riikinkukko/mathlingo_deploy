import { requireAdmin } from "@/lib/auth";
import { getActivity, getCohorts, getStandaloneFunnel, getFeatureUsage, getTeacherStats } from "@/lib/metrics";

export const dynamic = "force-dynamic";

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
const weekLabel = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });

function Tile({ value, label, hint }: { value: string | number; label: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line-soft bg-white p-4">
      <p className="font-display text-2xl font-black text-ink">{value}</p>
      <p className="text-[12px] font-bold text-ink-soft">{label}</p>
      {hint && <p className="mt-0.5 text-[11px] text-ink-soft/80">{hint}</p>}
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="font-display text-lg font-black text-ink">{title}</h2>
      {note && <p className="mb-3 text-xs text-ink-soft">{note}</p>}
      {children}
    </section>
  );
}

export default async function AdminMetricsPage() {
  await requireAdmin();
  const [act, cohorts, funnel, usage, teachers] = await Promise.all([
    getActivity(),
    getCohorts(),
    getStandaloneFunnel(),
    getFeatureUsage(),
    getTeacherStats(),
  ]);
  const steps = [
    { label: "Зарегистрировались", n: funnel.registered },
    { label: "Ответили на вопросы знакомства (можно пропустить)", n: funnel.onboarded },
    { label: "Решили первую задачу", n: funnel.firstAttempt },
    { label: "Занимались 3+ дня", n: funnel.active3 },
    { label: "Оплатили Pro", n: funnel.paid },
  ];
  const tg = (role: string) => usage.telegram[role] ?? { total: 0, linked: 0 };

  return (
    <div className="min-h-screen bg-paper pb-16">
      <header className="border-b border-line bg-white px-4 pb-4 pt-[max(1rem,var(--app-sat))]">
        <div className="mx-auto max-w-4xl">
          <a href="/admin" className="text-xs font-bold text-ink-soft hover:underline">
            ← Пользователи
          </a>
          <h1 className="mt-1 font-display text-xl font-black text-ink">Метрики</h1>
          <p className="text-xs text-ink-soft">По московскому времени. Демо- и тестовые аккаунты не учитываются.</p>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pt-6">
        <Section title="Активность учеников" note="Ученик активен, если решил хотя бы одну задачу.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile value={act.dau} label="сегодня" />
            <Tile value={act.wau} label="за 7 дней" hint={`из них без репетитора: ${act.wauStandalone}`} />
            <Tile value={act.mau} label="за 30 дней" />
            <Tile value={act.attemptsWeek} label="ответов за 7 дней" />
          </div>
        </Section>

        <Section
          title="Удержание по неделям регистрации"
          note="Сколько учеников из зарегистрированных на этой неделе решили задачу в первый день и вернулись позже. «—» — прошло слишком мало времени."
        >
          {cohorts.length === 0 ? (
            <p className="rounded-2xl border border-line-soft bg-white p-4 text-sm text-ink-soft">За 8 недель новых учеников нет.</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-line-soft bg-white">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-line-soft text-left text-[11px] font-black uppercase tracking-wide text-ink-soft">
                    <th className="px-4 py-2.5">Неделя</th>
                    <th className="px-3 py-2.5 text-right">Новых</th>
                    <th className="px-3 py-2.5 text-right">В 1-й день</th>
                    <th className="px-3 py-2.5 text-right">Вернулись на 2–7 день</th>
                    <th className="px-4 py-2.5 text-right">На 8–30 день</th>
                  </tr>
                </thead>
                <tbody>
                  {cohorts.map((c) => (
                    <tr key={c.week} className="border-b border-line-soft last:border-0">
                      <td className="px-4 py-2.5 font-bold text-ink">с {weekLabel(c.week)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{c.users}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{pct(c.day0, c.users)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{c.week1 === null ? "—" : pct(c.week1, c.users)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{c.month1 === null ? "—" : pct(c.month1, c.users)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="Воронка учеников без репетитора" note="Зарегистрированные за последние 30 дней.">
          <div className="space-y-2 rounded-2xl border border-line-soft bg-white p-4">
            {steps.map((s, i) => (
              <div key={s.label}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-bold text-ink">{s.label}</span>
                  <span className="tabular-nums text-ink-soft">
                    <span className="font-black text-ink">{s.n}</span>
                    {i > 0 && ` · ${pct(s.n, steps[0].n)}`}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-pill bg-grid">
                  <div className="h-full rounded-pill bg-pine" style={{ width: steps[0].n ? `${(s.n / steps[0].n) * 100}%` : "0%" }} />
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Фичи удержания и связи" note="За последние 30 дней.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile value={usage.streak3} label="серия 3+ дня сейчас" hint={`7+ дней: ${usage.streak7}`} />
            <Tile value={usage.freezesUsed} label="заморозок потрачено" />
            <Tile value={usage.nudges} label="«Напомнить» от репетиторов" />
            <Tile value={usage.questions} label="вопросов «Не понял»" hint={`с ответом: ${usage.questionsAnswered}`} />
            <Tile value={usage.homeworks} label="заданий выдано" />
            <Tile value={usage.weeklyReports} label="недельных отчётов родителям" />
            <Tile
              value={`${tg("STUDENT").linked}/${tg("STUDENT").total}`}
              label="ученики с Telegram"
              hint={pct(tg("STUDENT").linked, tg("STUDENT").total)}
            />
            <Tile
              value={`${tg("TEACHER").linked + tg("PARENT").linked}/${tg("TEACHER").total + tg("PARENT").total}`}
              label="репетиторы и родители с Telegram"
            />
          </div>
        </Section>

        <Section title="Репетиторы">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile value={teachers.teachers} label="всего" />
            <Tile value={teachers.withStudents} label="с учениками" />
            <Tile value={teachers.activeWeek} label="активны за неделю" hint="выдали задание или занятие" />
            <Tile value={teachers.pro} label="на тарифе Pro" />
          </div>
        </Section>
      </main>
    </div>
  );
}
