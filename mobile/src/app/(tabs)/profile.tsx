import { useState } from "react";
import { Alert, Pressable, Switch, View } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import { useAuth, useUser } from "@/lib/auth";
import { api, errorText } from "@/lib/api";
import type { UserSummary } from "@/lib/types";
import { useHome, useSelectedTopic, plural } from "@/lib/hooks";
import { openOnSite, openPublic } from "@/lib/web";
import { Button, Card, H1, Pill, ProgressBar, Row, Screen, T } from "@/components/ui";
import { Icon, Mascot } from "@/components/Svg";
import type { IconName } from "@/assets/svg";
import { C, R } from "@/theme";

export default function Profile() {
  const user = useUser();
  const { logout, setUser } = useAuth();
  const [reminders, setReminders] = useState(user.reminders !== false);
  async function toggleReminders(v: boolean) {
    setReminders(v);
    try {
      const r = await api<{ user: UserSummary }>("/api/m/settings", { body: { reminders: v } });
      setUser(r.user);
    } catch (e) {
      setReminders(!v);
      Alert.alert("Не сохранилось", errorText(e));
    }
  }
  const [topic] = useSelectedTopic();
  const home = useHome(topic).data;
  const s = home?.stats;

  return (
    <Screen>
      <View style={{ alignItems: "center", gap: 6, paddingTop: 8 }}>
        <Mascot mood="happy" size={88} />
        <H1 style={{ textAlign: "center" }}>{user.name}</H1>
        <T color={C.inkSoft}>{user.email}</T>
        <Row gap={6}>
          <Pill text={user.isPro ? "Pro" : "Бесплатный тариф"} bg={user.isPro ? C.amberLight : C.paper} color={user.isPro ? C.amberText : C.inkSoft} />
          {home?.user.teacherName ? <Pill text={`Репетитор: ${home.user.teacherName}`} /> : null}
        </Row>
      </View>

      {s ? (
        <Card style={{ gap: 12 }}>
          <Row style={{ justifyContent: "space-around" }}>
            <Stat value={String(s.streak)} label={plural(s.streak, ["день подряд", "дня подряд", "дней подряд"])} />
            <Stat value={String(s.xp)} label="опыта" />
            <Stat value={String(s.examDaysLeft)} label={`${plural(s.examDaysLeft, ["день", "дня", "дней"])} до ЕГЭ`} />
          </Row>
          <View style={{ gap: 4 }}>
            <T w="extrabold" size={13}>
              {s.level.title}
            </T>
            <ProgressBar pct={s.level.progressPct} />
          </View>
          {user.targetScore ? (
            <T size={13} color={C.inkSoft}>
              Цель на экзамене: {user.targetScore} {plural(user.targetScore, ["балл", "балла", "баллов"])}
            </T>
          ) : null}
        </Card>
      ) : null}

      {!user.emailVerified ? (
        <Card style={{ backgroundColor: C.amberLight, borderColor: C.amberLight }}>
          <T w="bold" color={C.amberText}>
            {user.standalone && !user.isPro
              ? "Подтверди почту — ссылка в письме от Планиметрики. Без этого энергия не восстанавливается."
              : "Подтверди почту — ссылка в письме от Планиметрики. Так ты точно не потеряешь доступ к аккаунту."}
          </T>
        </Card>
      ) : null}

      <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <T w="black">Напоминания вечером</T>
          <T size={13} color={C.inkSoft}>
            Если до 19:00 не было ни одной задачи, а серия или срок домашки под угрозой.
          </T>
        </View>
        <Switch value={reminders} onValueChange={toggleReminders} trackColor={{ true: C.pine, false: C.line }} thumbColor={C.white} />
      </Card>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        {user.hasTeacher || (home?.counts.homework ?? 0) > 0 ? <Item icon="Clipboard" label="Задания репетитора" onPress={() => router.push("/homework")} /> : null}
        <Item icon="Bell" label="Уведомления" onPress={() => router.push("/notifications")} />
        <Item icon="Grid" label="Тренировка по номерам ЕГЭ" onPress={() => router.push("/practice")} />
        <Item icon="Star" label="Достижения" onPress={() => router.push("/achievements")} />
        {user.hasTeacher ? <Item icon="Lightbulb" label="Вопросы репетитору" onPress={() => router.push("/questions")} /> : null}
        <Item icon="Settings" label="Настройки профиля" onPress={() => openOnSite("/student/profile")} external />
      </Card>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <Item label="Политика конфиденциальности" onPress={() => openPublic("/legal/privacy")} external />
        <Item label="Условия использования" onPress={() => openPublic("/legal/terms")} external />
        <Item label="Удалить аккаунт" onPress={() => openOnSite("/student/profile#delete")} external danger />
      </Card>

      <Button
        title="Выйти"
        kind="secondary"
        onPress={() =>
          Alert.alert("Выйти из аккаунта?", "Ответы, решённые без сети, отправятся при следующем входе.", [
            { text: "Отмена", style: "cancel" },
            { text: "Выйти", style: "destructive", onPress: () => void logout() },
          ])
        }
      />
      <T size={12} color={C.inkSoft} style={{ textAlign: "center" }}>
        Планиметрика {Constants.expoConfig?.version ?? ""}
      </T>
    </Screen>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <T w="black" size={24}>
        {value}
      </T>
      <T size={12} color={C.inkSoft} style={{ textAlign: "center" }}>
        {label}
      </T>
    </View>
  );
}

function Item({ icon, label, onPress, external, danger }: { icon?: IconName; label: string; onPress: () => void; external?: boolean; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: C.lineSoft, backgroundColor: pressed ? C.paper : C.white })}>
      {icon ? <Icon name={icon} size={22} color={C.inkSoft} /> : null}
      <T w="bold" color={danger ? C.coralText : C.ink} style={{ flex: 1 }}>
        {label}
      </T>
      <T w="black" color={C.inkSoft}>
        {external ? "↗" : "›"}
      </T>
    </Pressable>
  );
}
