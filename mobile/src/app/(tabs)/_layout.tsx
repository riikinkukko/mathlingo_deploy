import { Tabs } from "expo-router/js-tabs";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import type { HomePayload } from "@/lib/types";
import { Icon } from "@/components/Svg";
import { C, F } from "@/theme";
import type { IconName } from "@/assets/svg";
import { useEffect } from "react";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

/** Иконка вкладки: при выборе подпрыгивает и чуть увеличивается. */
function TabIcon({ name, color, focused }: { name: IconName; color: string; focused: boolean }) {
  const s = useSharedValue(1);
  const y = useSharedValue(0);
  useEffect(() => {
    if (focused) {
      s.value = withSequence(withTiming(1.22, { duration: 120 }), withSpring(1.08, { damping: 8, stiffness: 220 }));
      y.value = withSequence(withTiming(-5, { duration: 120 }), withSpring(0, { damping: 8 }));
    } else s.value = withSpring(1);
  }, [focused, s, y]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }, { scale: s.value }] }));
  return (
    <Animated.View style={a}>
      <Icon name={name} size={24} color={color} />
    </Animated.View>
  );
}

function tabIcon(name: IconName) {
  // eslint-disable-next-line react/display-name
  return ({ color, focused }: { color: unknown; focused: boolean }) => <TabIcon name={name} color={String(color ?? C.inkSoft)} focused={focused} />;
}

export default function TabsLayout() {
  // Счётчики на вкладках берём из кэша главной (обновляется вместе с ней).
  const home = useQuery({ queryKey: ["home", "auto"], queryFn: () => api<HomePayload>("/api/m/home"), enabled: false });
  const counts = home.data?.counts;
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenListeners={{ tabPress: () => void Haptics.selectionAsync().catch(() => {}) }}
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
