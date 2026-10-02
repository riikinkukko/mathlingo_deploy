import { getSessionUser } from "@/lib/auth";
import { logoutAction } from "@/app/actions";
import TeacherShell from "@/components/TeacherShell";
import TelegramConnectCard from "@/components/TelegramConnectCard";
import TeacherTelegramPrefs from "@/components/TeacherTelegramPrefs";

export default async function TeacherSettingsPage({ searchParams }: { searchParams: { telegram?: string } }) {
  const user = (await getSessionUser())!;

  return (
    <TeacherShell active="settings" title="Настройки">
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        <div>
          <h1 className="sr-only lg:not-sr-only font-display text-2xl font-black text-ink">Настройки</h1>
          <p className="mt-1 text-sm text-ink-soft">{user.name} · {user.email}</p>
        </div>

        <TelegramConnectCard
          user={user}
          returnTo="/teacher/settings"
          disconnected={searchParams.telegram === "disconnected"}
          pitch="Бот напишет, когда ученик сдал домашку, спросит после занятия «было или не было» (отметка прямо из чата) и пришлёт утреннюю сводку на день."
          connectedNote="Уведомления кабинета дублируются сюда."
        >
          <TeacherTelegramPrefs
            homework={user.tgNotifyHomework !== false}
            lessons={user.tgNotifyLessons !== false}
            digest={user.tgDailyDigest !== false}
          />
        </TelegramConnectCard>

        <form action={logoutAction}>
          <button type="submit" className="btn-secondary !border-coral/30 !text-coral hover:!border-coral">
            Выйти из аккаунта
          </button>
        </form>
      </main>
    </TeacherShell>
  );
}
