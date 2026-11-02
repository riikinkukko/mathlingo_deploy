import { View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth, useUser } from "@/lib/auth";
import { api } from "@/lib/api";
import { openOnSite } from "@/lib/web";
import { Button, Card, H1, H2, Row, Screen, T } from "@/components/ui";
import { Icon, Mascot } from "@/components/Svg";
import type { IconName } from "@/assets/svg";
import { C } from "@/theme";

/** Репетитор и родитель: уведомления в приложении, кабинет открывается на сайте уже вошедшим. */
export default function Staff() {
  const user = useUser();
  const { logout } = useAuth();
  const unread = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<{ notifications: unknown[]; unread: number }>("/api/m/notifications"),
  }).data?.unread ?? 0;
  const teacher = user.role === "TEACHER";
  const links: { icon: IconName; title: string; text: string; path: string }[] = teacher
    ? [
        { icon: "User", title: "Ученики", text: "Прогресс, домашки, пробники", path: "/teacher" },
        { icon: "Check", title: "Проверка решений", text: "Вторая часть и вопросы учеников", path: "/teacher/reviews" },
        { icon: "Calendar", title: "Расписание", text: "Занятия на неделю", path: "/teacher/schedule" },
        { icon: "Wallet", title: "Оплаты", text: "Кто сколько должен", path: "/teacher/payments" },
      ]
    : [{ icon: "User", title: "Кабинет родителя", text: "Успехи ребёнка и отчёты", path: "/parent" }];

  return (
    <Screen>
      <Row>
        <Mascot mood="happy" size={56} />
        <View style={{ flex: 1 }}>
          <H1>{user.name.split(" ")[0]}</H1>
          <T color={C.inkSoft}>{teacher ? "Кабинет репетитора" : "Кабинет родителя"}</T>
        </View>
      </Row>
      <Card onPress={() => router.push("/notifications")} style={{ backgroundColor: unread ? C.pineLight : C.white }}>
        <Row>
          <Icon name="Bell" size={24} color={C.pineStrong} />
          <T w="black" style={{ flex: 1 }}>
            {unread ? `Новых уведомлений: ${unread}` : "Уведомления"}
          </T>
          <T w="black" color={C.inkSoft}>
            ›
          </T>
        </Row>
      </Card>
      <H2>Кабинет</H2>
      {links.map((l) => (
        <Card key={l.path} onPress={() => openOnSite(l.path)}>
          <Row>
            <Icon name={l.icon} size={26} color={C.pineStrong} />
            <View style={{ flex: 1 }}>
              <T w="black">{l.title}</T>
              <T size={13} color={C.inkSoft}>
                {l.text}
              </T>
            </View>
            <T w="black" color={C.inkSoft}>
              ↗
            </T>
          </Row>
        </Card>
      ))}
      <T size={12} color={C.inkSoft}>
        Кабинет открывается на сайте — вход выполнится сам. Пуш-уведомления о новых решениях и вопросах приходят на телефон.
      </T>
      <Button title="Выйти" kind="secondary" onPress={() => void logout()} />
    </Screen>
  );
}
