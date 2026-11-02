import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorText } from "@/lib/api";
import type { NotificationM } from "@/lib/types";
import { Button, Empty, ErrorBox, Header, Loading, Screen, T } from "@/components/ui";
import { useUser } from "@/lib/auth";
import { routeForLink } from "@/lib/push";
import { openOnSite } from "@/lib/web";
import { C, R } from "@/theme";

function ago(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} мин назад`;
  if (s < 86400) return `${Math.round(s / 3600)} ч назад`;
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

export default function Notifications() {
  const user = useUser();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["notifications"], queryFn: () => api<{ notifications: NotificationM[]; unread: number }>("/api/m/notifications") });

  async function markRead(id?: string) {
    await api("/api/m/notifications", { body: id ? { id } : {} }).catch(() => {});
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }
  function open(n: NotificationM) {
    if (!n.read) void markRead(n.id);
    const r = routeForLink(n.link, user.role);
    if ("app" in r) router.push(r.app as never);
    else void openOnSite(r.web);
  }

  const header = (
    <Header
      title="Уведомления"
      right={q.data?.unread ? <Button title="Прочитать все" kind="ghost" small onPress={() => markRead()} /> : undefined}
    />
  );
  if (q.isLoading && !q.data) return <Loading />;
  if (!q.data) return <Screen header={header}><ErrorBox message={errorText(q.error)} onRetry={() => q.refetch()} /></Screen>;
  return (
    <Screen header={header} onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      {q.data.notifications.length === 0 ? <Empty title="Пока тихо" text="Здесь появятся проверенные решения, новые задания и напоминания." /> : null}
      {q.data.notifications.map((n) => (
        <Pressable
          key={n.id}
          onPress={() => open(n)}
          style={({ pressed }) => ({
            backgroundColor: n.read ? C.white : C.pineLight,
            borderRadius: R.card,
            padding: 14,
            gap: 4,
            borderWidth: 1,
            borderColor: n.read ? C.lineSoft : C.pineMint,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
            <T w="black" style={{ flex: 1 }}>
              {n.title}
            </T>
            <T size={12} color={C.inkSoft}>
              {ago(n.createdAt)}
            </T>
          </View>
          {n.body ? (
            <T size={14} color={C.inkSoft}>
              {n.body}
            </T>
          ) : null}
        </Pressable>
      ))}
    </Screen>
  );
}
