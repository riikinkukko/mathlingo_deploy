import { useEffect } from "react";
import { Tabs } from "expo-router/js-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Icon } from "@/components/Svg";
import { useT } from "@/lib/teacher";
import { C, F } from "@/theme";
import type { IconName } from "@/assets/svg";

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

const icon = (name: IconName) =>
  // eslint-disable-next-line react/display-name
  ({ color, focused }: { color: unknown; focused: boolean }) => <TabIcon name={name} color={String(color ?? C.inkSoft)} focused={focused} />;

export default function TeacherTabs() {
  const insets = useSafeAreaInsets();
  // Счётчики — из кэша главной.
  const home = useT("home", {}, false).data;
  const reviews = home?.attention.reviews ?? 0;
  const unmarked = home?.attention.unmarked.length ?? 0;
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
      <Tabs.Screen name="index" options={{ title: "Ученики", tabBarIcon: icon("User") }} />
      <Tabs.Screen name="schedule" options={{ title: "Расписание", tabBarIcon: icon("Calendar"), tabBarBadge: unmarked || undefined }} />
      <Tabs.Screen name="reviews" options={{ title: "Проверка", tabBarIcon: icon("Check"), tabBarBadge: reviews || undefined }} />
      <Tabs.Screen name="payments" options={{ title: "Оплаты", tabBarIcon: icon("Wallet") }} />
      <Tabs.Screen name="more" options={{ title: "Ещё", tabBarIcon: icon("Grid") }} />
    </Tabs>
  );
}
