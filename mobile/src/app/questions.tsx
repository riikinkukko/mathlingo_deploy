import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import Animated from "react-native-reanimated";
import { api, errorText } from "@/lib/api";
import { Card, Empty, ErrorBox, Header, Loading, Pill, Row, Screen, T } from "@/components/ui";
import { enter } from "@/components/motion";
import { dateLabel } from "@/lib/mock-format";
import { C } from "@/theme";

type Q = { id: string; problemText: string; egeTaskNumber: number | null; studentAnswer: string | null; message: string; answer: string | null; answeredAt: string | null; createdAt: string; hasSketch: boolean };

export default function Questions() {
  const q = useQuery({ queryKey: ["questions"], queryFn: () => api<{ questions: Q[]; canAsk: boolean }>("/api/m/questions") });
  const header = <Header title="Вопросы репетитору" />;
  if (q.isLoading && !q.data) return <Loading />;
  if (!q.data) return <Screen header={header}><ErrorBox message={errorText(q.error)} onRetry={() => q.refetch()} /></Screen>;
  return (
    <Screen header={header} onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      {q.data.questions.length === 0 ? (
        <Empty mood="thinking" title="Пока вопросов не было" text="Нажми «Не понял — спросить репетитора» под задачей — вопрос и ответ появятся здесь." />
      ) : null}
      {q.data.questions.map((x, i) => (
        <Animated.View key={x.id} entering={enter(i)}>
          <Card style={{ gap: 8 }}>
            <Row style={{ justifyContent: "space-between" }}>
              {x.egeTaskNumber ? <Pill text={`№${x.egeTaskNumber}`} bg={C.amberLight} color={C.amberText} /> : <View />}
              <T size={12} color={C.inkSoft}>{dateLabel(x.createdAt)}</T>
            </Row>
            <T w="semibold" numberOfLines={3}>{x.problemText}</T>
            {x.message ? (
              <View style={{ backgroundColor: C.paper, borderRadius: 12, padding: 10 }}>
                <T size={12} w="extrabold" color={C.inkSoft}>ТВОЙ ВОПРОС{x.hasSketch ? " · с черновиком" : ""}</T>
                <T>{x.message}</T>
              </View>
            ) : null}
            {x.answer ? (
              <View style={{ backgroundColor: C.pineLight, borderRadius: 12, padding: 10 }}>
                <T size={12} w="extrabold" color={C.pineStrong}>ОТВЕТ РЕПЕТИТОРА</T>
                <T style={{ lineHeight: 22 }}>{x.answer}</T>
              </View>
            ) : (
              <Pill text="ждёт ответа" bg={C.violetLight} color={C.violetText} />
            )}
          </Card>
        </Animated.View>
      ))}
    </Screen>
  );
}
