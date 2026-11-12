import { useAuth } from "@/lib/auth";
import { errorText } from "@/lib/api";
import { plural } from "@/lib/hooks";
import { openOnSite } from "@/lib/web";
import { dayLabel, mskKey, useT, useTAction } from "@/lib/teacher";
import { Button, Card, ErrorBox, Header, Loading, Screen, T } from "@/components/ui";
import { Section, Toggle } from "@/components/teacher";
import { C } from "@/theme";

export default function TeacherSettings() {
  const q = useT("settings");
  const { run } = useTAction();
  const { logout } = useAuth();
  const d = q.data;
  const header = <Header title="Настройки" subtitle={d ? `${d.name} · ${d.email}` : undefined} />;
  if (q.isLoading && !d) return <Loading />;
  if (!d) return <Screen header={header}><ErrorBox message={errorText(q.error)} onRetry={() => q.refetch()} /></Screen>;
  const tg = d.telegram;
  const save = (patch: Partial<typeof tg>) => {
    const v = { ...tg, ...patch };
    void run("saveTelegramPrefs", { homework: v.homework, lessons: v.lessons, digest: v.digest });
  };
  const p = d.plan;
  return (
    <Screen header={header} onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <Section title="Тариф" />
      {/* Только статус: оформление тарифа — на сайте, в приложении оплаты нет. */}
      <Card style={{ gap: 4 }}>
        <T w="black">{p.source === "owner" ? "Владелец платформы — без ограничений" : p.source === "trial" ? "Пробный «Профи»" : `«${p.name}»`}</T>
        <T size={13} color={C.inkSoft}>
          {p.source === "trial" && p.trialDaysLeft !== null
            ? `Осталось ${p.trialDaysLeft} ${plural(p.trialDaysLeft, ["день", "дня", "дней"])}`
            : p.until
              ? `Действует до ${dayLabel(mskKey(new Date(p.until)), { day: "numeric", month: "long", year: "numeric" })}`
              : ""}
        </T>
        <T size={13} color={C.inkSoft}>
          Учеников: {p.studentsCount}
          {p.limit !== null ? ` из ${p.limit}` : ""}
        </T>
      </Card>

      <Section title="Telegram" />
      <Card style={{ gap: 6 }}>
        {tg.connected ? (
          <>
            <Toggle label="Сданные домашки" value={tg.homework} onChange={(v) => save({ homework: v })} />
            <Toggle label="Отметка занятий «было / не было»" value={tg.lessons} onChange={(v) => save({ lessons: v })} />
            <Toggle label="Утренняя сводка на день" value={tg.digest} onChange={(v) => save({ digest: v })} />
            <Button title="Отключить Telegram" kind="ghost" small onPress={() => run("disconnectTelegram")} />
          </>
        ) : (
          <>
            <T size={13} color={C.inkSoft}>
              Бот напишет о сданных работах, спросит после занятия «было или не было» и пришлёт сводку на день.
            </T>
            <Button title="Подключить на сайте" kind="secondary" small onPress={() => void openOnSite("/teacher/settings#telegram")} />
          </>
        )}
      </Card>

      <Section title="Аккаунт" />
      <Button title="Выйти" kind="secondary" onPress={() => void logout()} />
    </Screen>
  );
}
