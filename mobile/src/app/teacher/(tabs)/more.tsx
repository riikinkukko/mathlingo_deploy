import { View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { openOnSite } from "@/lib/web";
import { useT } from "@/lib/teacher";
import { Button, Card, Pill, Row, Screen, T } from "@/components/ui";
import { Icon } from "@/components/Svg";
import type { IconName } from "@/assets/svg";
import { C } from "@/theme";

function Item({ icon, title, text, badge, onPress, external }: { icon: IconName; title: string; text: string; badge?: number; onPress: () => void; external?: boolean }) {
  return (
    <Card onPress={onPress}>
      <Row>
        <Icon name={icon} size={24} color={C.pineStrong} />
        <View style={{ flex: 1 }}>
          <T w="black">{title}</T>
          <T size={12} color={C.inkSoft}>
            {text}
          </T>
        </View>
        {badge ? <Pill text={String(badge)} bg={C.violetLight} color={C.violetText} /> : null}
        <T w="black" color={C.inkSoft}>
          {external ? "↗" : "›"}
        </T>
      </Row>
    </Card>
  );
}

export default function TeacherMore() {
  const { logout } = useAuth();
  const home = useT("home").data;
  const unread = useQuery({ queryKey: ["notifications"], queryFn: () => api<{ unread: number }>("/api/m/notifications") }).data?.unread ?? 0;
  return (
    <Screen>
      <T w="black" size={24}>
        Ещё
      </T>
      <Item icon="Bell" title="Уведомления" text="Сданные работы, вопросы, ответы учеников" badge={unread} onPress={() => router.push("/notifications")} />
      <Item icon="Lightbulb" title="Вопросы учеников" text="Ученики спрашивают по задачам" badge={home?.attention.questions} onPress={() => router.push("/teacher/questions")} />
      <Item icon="User" title="Группы" text="Занятия и задания сразу нескольким ученикам" onPress={() => router.push("/teacher/groups")} />
      <Item icon="Clipboard" title="Новое задание" text="Из банка задач или по шаблону" onPress={() => router.push("/teacher/homework-new")} />
      <Item icon="Settings" title="Настройки" text="Telegram, тариф, выход" onPress={() => router.push("/teacher/settings")} />
      <Item icon="Book" title="Кабинет на сайте" text="Свои задачи, программа, отчёты — вход выполнится сам" external onPress={() => void openOnSite("/teacher")} />
      <Button title="Выйти" kind="secondary" onPress={() => void logout()} />
    </Screen>
  );
}
