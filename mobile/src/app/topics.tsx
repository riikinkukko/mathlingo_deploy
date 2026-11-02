import { Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useHome, useSelectedTopic } from "@/lib/hooks";
import { Header, ProgressBar, Row, Screen, T } from "@/components/ui";
import { C, R } from "@/theme";

/** Выбор темы для «Пути». */
export default function TopicsScreen() {
  const { current } = useLocalSearchParams<{ current?: string }>();
  const [topic, setTopic] = useSelectedTopic();
  const home = useHome(topic);
  const topics = home.data?.topics ?? [];
  return (
    <Screen header={<Header title="Темы" subtitle="Программа профильного ЕГЭ, от №1 до №20" />}>
      {topics.map((t) => {
        const active = t.id === (current ?? home.data?.topic?.id);
        return (
          <Pressable
            key={t.id}
            onPress={() => {
              setTopic(t.id);
              router.back();
            }}
            style={({ pressed }) => ({
              backgroundColor: active ? C.pineDark : C.white,
              borderRadius: R.card,
              padding: 16,
              borderWidth: 1,
              borderColor: active ? C.pineDark : C.lineSoft,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Row>
              <T size={28}>{t.icon}</T>
              <View style={{ flex: 1, gap: 6 }}>
                <T w="black" size={16} color={active ? C.white : C.ink}>
                  {t.title}
                </T>
                <ProgressBar pct={t.total ? (t.done / t.total) * 100 : 0} height={6} track={active ? "rgba(255,255,255,0.2)" : C.grid} />
                <T size={12} color={active ? "rgba(255,255,255,0.75)" : C.inkSoft}>
                  {t.done} из {t.total} уроков пройдено
                </T>
              </View>
            </Row>
          </Pressable>
        );
      })}
    </Screen>
  );
}
