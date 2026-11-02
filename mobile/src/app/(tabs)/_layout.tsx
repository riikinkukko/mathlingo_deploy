import { Tabs } from "expo-router/js-tabs";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import type { HomePayload } from "@/lib/types";
import { Icon } from "@/components/Svg";
import { C, F } from "@/theme";
import type { IconName } from "@/assets/svg";

function tabIcon(name: IconName) {
  // eslint-disable-next-line react/display-name
  return ({ color }: { color: unknown }) => <Icon name={name} size={24} color={String(color ?? C.inkSoft)} />;
}

export default function TabsLayout() {
  // Счётчики на вкладках берём из кэша главной (обновляется вместе с ней).
  const home = useQuery({ queryKey: ["home", "auto"], queryFn: () => api<HomePayload>("/api/m/home"), enabled: false });
  const counts = home.data?.counts;
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.pineStrong,
        tabBarInactiveTintColor: C.inkSoft,
        tabBarLabelStyle: { fontFamily: F.extrabold, fontSize: 11, lineHeight: 14 },
        tabBarStyle: { backgroundColor: C.white, borderTopColor: C.lineSoft, height: 66 + insets.bottom, paddingTop: 6, paddingBottom: insets.bottom + 10 },
        tabBarBadgeStyle: { backgroundColor: C.violet, fontFamily: F.black, fontSize: 10 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Путь", tabBarIcon: tabIcon("Map") }} />
      <Tabs.Screen
        name="review"
        options={{ title: "Повтор", tabBarIcon: tabIcon("Repeat"), tabBarBadge: counts?.dueReview ? counts.dueReview : undefined }}
      />
      <Tabs.Screen name="mocks" options={{ title: "Пробники", tabBarIcon: tabIcon("Clock") }} />
      <Tabs.Screen
        name="mistakes"
        options={{ title: "Ошибки", tabBarIcon: tabIcon("Book"), tabBarBadge: counts?.mistakes ? counts.mistakes : undefined }}
      />
      <Tabs.Screen name="profile" options={{ title: "Профиль", tabBarIcon: tabIcon("User") }} />
    </Tabs>
  );
}
