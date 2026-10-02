import { getSessionUser } from "@/lib/auth";
import {
  computeOverallStats,
  computeXp,
  computeStreak,
  getLevelInfo,
  getAchievementStats,
  isStandaloneStudent,
  isEffectivelyPro,
  isEnergyRechargeBlocked,
} from "@/lib/queries";
import { computeAchievementProgress } from "@/lib/achievements";
import { isTelegramConfigured, buildTelegramLinkUrl } from "@/lib/telegram";
import { generateTelegramLinkCode, getMockScores, computeWeekActivity, getExamMapForStudent } from "@/lib/queries";
import GoalCard from "@/components/GoalCard";
import ExamMap from "@/components/ExamMap";
import { disconnectTelegramAction } from "@/app/actions-telegram";
import { logoutAction } from "@/app/actions";
import DeleteAccountSection from "@/components/DeleteAccountSection";
import VerifyEmailReminder from "@/components/VerifyEmailReminder";
import StudentShell from "@/components/StudentShell";
import Mascot from "@/components/Mascot";
import { IconCrown } from "@/components/icons";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: { telegram?: string; error?: string };
}) {
  const user = (await getSessionUser())!;
  const xp = await computeXp(user.id);
  const streak = await computeStreak(user.id);
  const level = getLevelInfo(xp);
  const stats = await computeOverallStats(user.id);
  const achievementStats = await getAchievementStats(user.id);
  const progress = computeAchievementProgress(achievementStats);
  const earnedCount = progress.filter((p) => p.tierIndex >= 0).length;
  const topAchievements = [...progress].sort((a, b) => b.tierIndex - a.tierIndex).slice(0, 4);
  const [mocksRaw, week, examMap] = await Promise.all([
    getMockScores(user.id),
    computeWeekActivity(user.id),
    getExamMapForStudent(user.id),
  ]);
  // Комментарии к пробникам репетитор пишет для себя — ученику только балл и дату.
  const mocks = mocksRaw.map((m) => ({ ...m, note: null }));
  const weekDays = week.filter((d) => d.done).length;

  // Ссылку на бота строим прямо здесь, на сервере, и рендерим обычным <a
  // href>, а не через серверный экшен с redirect() на внешний домен —
  // такой redirect из server action один раз уже стал подозреваемым в
  // баге "код в БД появляется, а привязка не срабатывает" (см. README):
  // это отдельный, менее предсказуемый путь навигации, чем просто клик
  // по ссылке браузером. Код генерируется заново при каждом заходе на
  // профиль, пока Telegram не подключён — старый код от предыдущего
  // визита просто перезаписывается, это не проблема (он одноразовый).
  const telegramLinkUrl =
    !user.telegramChatId && isTelegramConfigured()
      ? buildTelegramLinkUrl(await generateTelegramLinkCode(user.id))
      : null;

  const standalone = isStandaloneStudent(user);
  const pro = standalone && isEffectivelyPro(user);
  // «С нами с сентября 2026» — месяц нужен в родительном падеже; его даёт
  // формат с днём («1 сентября»), день потом отрезаем.
  const created = new Date(user.createdAt);
  const memberSince = `${created
    .toLocaleDateString("ru-RU", { day: "numeric", month: "long" })
    .replace(/^\d+\s/, "")} ${created.getFullYear()}`;

  return (
    <StudentShell active="profile" title="Профиль">
      <div className="px-4 py-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div className="flex items-center gap-4">
            <Mascot mood="happy" size={84} float={false} />
            <div>
              <h1 className="font-display text-2xl font-black text-ink">{user.name}</h1>
              <p className="text-xs text-ink-soft">С нами с {memberSince}</p>
              {pro && (
                <span className="mt-1 inline-flex items-center gap-1 rounded-pill bg-gradient-to-r from-amber to-coral px-2.5 py-1 text-[11px] font-extrabold text-white">
                  <IconCrown className="h-3 w-3" /> PRO
                </span>
              )}
            </div>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="shrink-0 rounded-full border-2 border-line px-3 py-1.5 text-xs font-extrabold uppercase text-ink-soft transition hover:border-coral hover:text-coral"
            >
              Выйти
            </button>
          </form>
        </div>

        {!user.emailVerifiedAt && (
          <div className="mb-4">
            <VerifyEmailReminder
              compact
              reason={
                isEnergyRechargeBlocked(user)
                  ? "Подтвердите email — без этого энергия не восстанавливается"
                  : undefined
              }
            />
          </div>
        )}

        <div className="card mb-6 p-5">
          <div className="flex items-center justify-between">
            <p className="font-display text-lg font-black text-ink">{level.title}</p>
            <p className="text-xs font-bold text-ink-soft">
              {level.nextLevelMinXp !== null ? `${level.xp} / ${level.nextLevelMinXp} XP` : `${level.xp} XP · максимум`}
            </p>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-pill bg-grid">
            <div
              className="h-full rounded-pill bg-gradient-to-r from-teal to-pine transition-all"
              style={{ width: `${level.progressPct}%` }}
            />
          </div>
        </div>

        {/* Прогресс к экзамену: цель и пробники, неделя, карта номеров ЕГЭ. */}
        {(user.targetScore || mocks.length > 0) && <GoalCard targetScore={user.targetScore} mocks={mocks} readOnly />}
        <section className="mb-4 rounded-[20px] border border-line-soft bg-white p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-[16px] font-black text-ink">Эта неделя</h2>
            <span className="text-[12px] font-bold text-ink-soft">
              {weekDays} из 7 дней · серия {streak}
            </span>
          </div>
          <ul className="mt-3 grid grid-cols-7 gap-1.5">
            {week.map((d) => (
              <li key={d.label} className="flex flex-col items-center gap-1">
                <span
                  aria-label={`${d.label}: ${d.done ? "занимался" : "нет"}`}
                  className={`h-9 w-full rounded-[10px] ${
                    d.done ? "bg-pine-dark" : d.isToday ? "border-2 border-dashed border-pine-mint bg-white" : "bg-grid"
                  }`}
                />
                <span className={`text-[11px] font-black ${d.isToday ? "text-ink" : "text-ink-soft"}`}>{d.label}</span>
              </li>
            ))}
          </ul>
        </section>
        <div className="mb-6">
          <ExamMap rows={examMap} />
        </div>

        <div className="mb-6 grid grid-cols-3 gap-3">
          <StatChip label="Решено задач" value={`${stats.solvedProblems}`} />
          <StatChip label="Точность" value={`${stats.accuracy}%`} />
          <StatChip label="Дней подряд" value={`${streak}`} />
        </div>

        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-black text-ink">Достижения</h2>
          <a href="/student/achievements" className="text-xs font-bold text-pine hover:underline">
            Все ({earnedCount}/{progress.length}) →
          </a>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {topAchievements.map((p) => {
            const earned = p.tierIndex >= 0;
            return (
              <div key={p.def.id} className="card flex flex-col items-center p-3 text-center">
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-full text-xl ${
                    earned ? "bg-gradient-to-br from-amber to-coral" : "bg-line grayscale"
                  }`}
                >
                  {p.def.icon}
                </div>
                <p className="mt-1.5 line-clamp-2 text-[10px] font-bold leading-tight text-ink">
                  {p.def.title}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-6 card p-5">
          <h2 className="mb-1 font-display text-base font-black text-ink">Уведомления в Telegram</h2>
          {searchParams.telegram === "disconnected" && (
            <p className="mb-2 text-xs font-bold text-coral">Telegram отключён.</p>
          )}
          {searchParams.error === "telegram_not_configured" && (
            <p className="mb-2 text-xs font-bold text-coral">
              Telegram-уведомления пока не настроены на сервере.
            </p>
          )}
          {user.telegramChatId ? (
            <>
              <p className="mb-3 text-sm text-ink-soft">
                ✅ Подключено — новые задания, пробники и результаты проверки
                будут приходить и сюда, и в приложение.
              </p>
              <form action={disconnectTelegramAction}>
                <button type="submit" className="btn-secondary !text-xs !text-coral">
                  Отключить
                </button>
              </form>
            </>
          ) : (
            <>
              <p className="mb-3 text-sm text-ink-soft">
                Получай уведомления о новых заданиях, пробниках и проверке решений
                прямо в Telegram — не нужно заходить в приложение, чтобы не пропустить.
              </p>
              {telegramLinkUrl ? (
                <a href={telegramLinkUrl} className="btn-primary !text-xs" target="_blank" rel="noopener noreferrer">
                  Подключить Telegram
                </a>
              ) : (
                <p className="text-xs text-ink-soft/70">Пока недоступно.</p>
              )}
            </>
          )}
        </div>
        <DeleteAccountSection requestedAt={user.deletionRequestedAt} />
      </div>
      </div>
    </StudentShell>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-3 py-3 text-center">
      <p className="font-mono text-lg font-semibold leading-none text-ink">{value}</p>
      <p className="mt-1 text-[10px] text-ink-soft">{label}</p>
    </div>
  );
}
