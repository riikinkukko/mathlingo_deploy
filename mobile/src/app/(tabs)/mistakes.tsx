import { useState } from "react";
import Animated, { LinearTransition } from "react-native-reanimated";
import { enter } from "@/components/motion";
import { Pressable, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { api, errorText } from "@/lib/api";
import type { MistakeItem } from "@/lib/types";
import { Card, Empty, ErrorBox, H1, H2, Loading, Row, Screen, T } from "@/components/ui";
import { Icon } from "@/components/Svg";
import ProblemCard from "@/components/ProblemCard";
import { C } from "@/theme";

/** «Мои ошибки» — задачи, где ошибался; перерешать можно прямо здесь. */
export default function MistakesScreen() {
  const q = useQuery({ queryKey: ["mistakes"], queryFn: () => api<{ items: MistakeItem[] }>("/api/m/mistakes") });
  const [open, setOpen] = useState<string | null>(null);

  if (q.isLoading && !q.data) return <Loading />;
  if (!q.data) return <Screen><ErrorBox message={errorText(q.error)} onRetry={() => q.refetch()} /></Screen>;
  const unresolved = q.data.items.filter((m) => !m.resolved);
  const resolved = q.data.items.filter((m) => m.resolved);

  const row = (m: MistakeItem) => {
    const isOpen = open === m.problem.id;
    return (
      <Card key={m.problem.id} style={{ gap: 10, borderColor: m.resolved ? C.lineSoft : C.coralLight, borderWidth: m.resolved ? 1 : 2 }}>
        <Pressable onPress={() => setOpen(isOpen ? null : m.problem.id)}>
          <Row style={{ alignItems: "flex-start" }}>
            <Icon name={m.resolved ? "Check" : "Close"} size={18} color={m.resolved ? C.pine : C.coral} />
            <View style={{ flex: 1, gap: 2 }}>
              <T numberOfLines={isOpen ? undefined : 2}>{m.problem.text}</T>
              <T size={12} color={C.inkSoft}>
                {m.chapterTitle} · {m.skillTitle}
              </T>
              {!m.resolved && m.lastWrongAnswer ? (
                <T size={12} color={C.coralText}>
                  Твой ответ: {m.lastWrongAnswer}
                </T>
              ) : null}
            </View>
            <T w="black" color={C.pineStrong}>
              {isOpen ? "▲" : "▼"}
            </T>
          </Row>
        </Pressable>
        {isOpen ? <ProblemCard problem={{ ...m.problem }} source="lesson" onSolved={() => q.refetch()} /> : null}
      </Card>
    );
  };

  return (
    <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <H1>Мои ошибки</H1>
      <T color={C.inkSoft}>Задачи, где хотя бы раз ответил неверно. Нажми, чтобы перерешать.</T>
      {q.data.items.length === 0 ? (
        <Empty mood="happy" title="Ошибок пока нет!" text="Или ты идеален, или ещё не начал 🙂" />
      ) : (
        <>
          {unresolved.length ? <H2 style={{ color: C.coralText }}>Ещё не решено верно · {unresolved.length}</H2> : null}
          {unresolved.map((m, i) => (
            <Animated.View key={m.problem.id} entering={enter(i)} layout={LinearTransition}>
              {row(m)}
            </Animated.View>
          ))}
          {resolved.length ? <H2 style={{ color: C.pineStrong, marginTop: 8 }}>Исправлено · {resolved.length}</H2> : null}
          {resolved.map((m, i) => (
            <Animated.View key={m.problem.id} entering={enter(i + unresolved.length)} layout={LinearTransition}>
              {row(m)}
            </Animated.View>
          ))}
        </>
      )}
    </Screen>
  );
}
