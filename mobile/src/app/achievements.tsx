import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import Animated from "react-native-reanimated";
import { api, errorText } from "@/lib/api";
import { ErrorBox, Header, Loading, ProgressBar, Screen, T } from "@/components/ui";
import { Pop, enter } from "@/components/motion";
import { plural } from "@/lib/hooks";
import { C, R } from "@/theme";

type Item = { id: string; title: string; icon: string; description: string; tiers: number[]; value: number; tier: number; next: number | null; progressPct: number };

export default function Achievements() {
  const q = useQuery({ queryKey: ["achievements"], queryFn: () => api<{ items: Item[] }>("/api/m/achievements") });
  const header = <Header title="Достижения" />;
  if (q.isLoading && !q.data) return <Loading />;
  if (!q.data) return <Screen header={header}><ErrorBox message={errorText(q.error)} onRetry={() => q.refetch()} /></Screen>;
  const items = q.data.items;
  const total = items.reduce((s, i) => s + i.tiers.length, 0);
  const got = items.reduce((s, i) => s + i.tier + 1, 0);
  return (
    <Screen header={header} onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <T color={C.inkSoft}>
        Получено {got} из {total} {plural(total, ["уровня", "уровней", "уровней"])}
      </T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {items.map((a, i) => {
          const earned = a.tier >= 0;
          return (
            <Animated.View key={a.id} entering={enter(i)} style={{ width: "47.5%", backgroundColor: C.white, borderRadius: R.card, borderWidth: 1, borderColor: C.lineSoft, padding: 14, alignItems: "center", gap: 6 }}>
              <Pop delay={120 + i * 60}>
                <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", backgroundColor: earned ? C.amberLight : C.grid, opacity: earned ? 1 : 0.6 }}>
                  <T size={30}>{a.icon}</T>
                </View>
              </Pop>
              <T w="black" size={14} style={{ textAlign: "center" }}>
                {a.title}
              </T>
              {earned ? (
                <T w="extrabold" size={11} color={C.amberText}>
                  УРОВЕНЬ {a.tier + 1} из {a.tiers.length}
                </T>
              ) : (
                <T w="bold" size={11} color={C.inkSoft}>
                  ещё не получено
                </T>
              )}
              <View style={{ alignSelf: "stretch", gap: 4 }}>
                <ProgressBar pct={a.progressPct} color={earned ? C.amber : C.pine} track={C.grid} height={6} />
                <T size={11} color={C.inkSoft} style={{ textAlign: "center" }}>
                  {a.next ? `${a.value} / ${a.next}` : "максимум!"}
                </T>
              </View>
            </Animated.View>
          );
        })}
      </View>
    </Screen>
  );
}
