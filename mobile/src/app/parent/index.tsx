import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { api, errorText } from "@/lib/api";
import { plural } from "@/lib/hooks";
import { relDay } from "@/lib/teacher";
import { useParentChild, useParentHome } from "@/lib/parent";
import { Button, Card, Empty, ErrorBox, Loading, Row, Screen, T } from "@/components/ui";
import { Icon, Mascot } from "@/components/Svg";
import { ParentChildView } from "@/components/ParentChild";
import { C } from "@/theme";

/** Кабинет родителя: один ребёнок — сразу его неделя, несколько — список. */
export default function ParentHome() {
  const { logout } = useAuth();
  const q = useParentHome();
  const d = q.data;
  const only = d?.children.length === 1 ? d.children[0].id : undefined;
  const child = useParentChild(only);
  const unread = useQuery({ queryKey: ["notifications"], queryFn: () => api<{ unread: number }>("/api/m/notifications") }).data?.unread ?? 0;

  if (q.isLoading && !d) return <Loading />;
  if (!d) return <Screen><ErrorBox message={errorText(q.error)} onRetry={() => q.refetch()} /></Screen>;

  return (
    <Screen
      onRefresh={() => {
        void q.refetch();
        if (only) void child.refetch();
      }}
      refreshing={q.isRefetching || child.isRefetching}
    >
      <Row>
        <Mascot mood="happy" size={52} />
        <View style={{ flex: 1 }}>
          <T w="black" size={24}>
            {d.name.split(" ")[0]}
          </T>
          <T color={C.inkSoft} size={13}>
            Кабинет родителя
          </T>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={unread ? `Уведомления, новых: ${unread}` : "Уведомления"}
          onPress={() => router.push("/notifications")}
          style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: unread ? C.pineLight : C.white, borderWidth: 1, borderColor: C.lineSoft, alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="Bell" size={22} color={C.pineStrong} />
          {unread ? (
            <View style={{ position: "absolute", top: 4, right: 4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: C.violet, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}>
              <T w="black" size={10} color={C.white} style={{ lineHeight: 13 }}>
                {unread}
              </T>
            </View>
          ) : null}
        </Pressable>
      </Row>

      {d.children.length === 0 ? (
        <Empty title="Пока нет привязанных детей" text="Попросите репетитора добавить вас в аккаунт ученика — тогда здесь появится его неделя." />
      ) : only ? (
        child.data ? (
          <ParentChildView d={child.data} home={d} />
        ) : child.isLoading ? (
          <Loading />
        ) : (
          <ErrorBox message={errorText(child.error)} onRetry={() => child.refetch()} />
        )
      ) : (
        d.children.map((c) => (
          <Card key={c.id} onPress={() => router.push(`/parent/child/${c.id}`)} style={{ gap: 4 }}>
            <Row>
              <T w="black" size={17} style={{ flex: 1 }}>
                {c.name}
              </T>
              <T w="black" color={C.inkSoft}>
                ›
              </T>
            </Row>
            <T size={13} color={C.inkSoft}>
              {c.activeDays7 ? `Практика ${c.activeDays7} ${plural(c.activeDays7, ["день", "дня", "дней"])} из 7` : "На этой неделе не занимался(ась)"}
              {c.nextLesson ? ` · занятие ${relDay(c.nextLesson.startsAt)}` : ""}
            </T>
            <T size={13} color={c.hwOverdue ? C.coralText : C.inkSoft}>
              Решено {c.solved} · точность {c.accuracy}% · ДЗ в работе {c.hwOpen}
              {c.hwOverdue ? " · есть просроченное" : ""}
            </T>
          </Card>
        ))
      )}

      <Button title="Выйти" kind="secondary" onPress={() => void logout()} />
    </Screen>
  );
}
