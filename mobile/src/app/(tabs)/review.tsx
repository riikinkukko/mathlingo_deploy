import { useState } from "react";
import { View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorText } from "@/lib/api";
import type { MobileProblem } from "@/lib/types";
import { Button, Card, Empty, ErrorBox, H1, Loading, Pill, Row, Screen, T } from "@/components/ui";
import ProblemCard from "@/components/ProblemCard";
import { plural } from "@/lib/hooks";
import { C } from "@/theme";

interface ReviewPayload {
  items: { problem: MobileProblem; skillTitle: string; box: number }[];
}

/** Интервальное повторение: задачи, которые пора вспомнить. Без энергии. */
export default function ReviewScreen() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["review"], queryFn: () => api<ReviewPayload>("/api/m/review") });
  const [index, setIndex] = useState(0);
  const [solvedNow, setSolvedNow] = useState(false);

  if (q.isLoading && !q.data) return <Loading />;
  if (!q.data) return <Screen><ErrorBox message={errorText(q.error)} onRetry={() => q.refetch()} /></Screen>;
  const items = q.data.items;
  const item = items[index];

  return (
    <Screen
      onRefresh={() => {
        setIndex(0);
        q.refetch();
      }}
      refreshing={q.isRefetching}
    >
      <H1>Повторение</H1>
      {!item ? (
        <Empty
          mood="happy"
          title={items.length ? "На сегодня всё!" : "Повторять пока нечего"}
          text="Решённые задачи возвращаются через несколько дней: чем лучше помнишь — тем реже. Повторение не тратит энергию."
          action={
            items.length ? (
              <Button
                title="Обновить"
                kind="secondary"
                onPress={() => {
                  setIndex(0);
                  q.refetch();
                  qc.invalidateQueries({ queryKey: ["home"] });
                }}
              />
            ) : undefined
          }
        />
      ) : (
        <>
          <Row style={{ justifyContent: "space-between" }}>
            <T w="bold" color={C.inkSoft}>
              {index + 1} из {items.length} {plural(items.length, ["задачи", "задач", "задач"])}
            </T>
            <Pill text={item.skillTitle} bg={C.violetLight} color={C.violetText} />
          </Row>
          <Card>
            <ProblemCard key={item.problem.id} problem={item.problem} source="review" onSolved={() => setSolvedNow(true)} />
          </Card>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button
              title={solvedNow ? "Дальше" : "Пропустить"}
              kind={solvedNow ? "primary" : "secondary"}
              style={{ flex: 1 }}
              onPress={() => {
                setSolvedNow(false);
                setIndex(index + 1);
                if (index + 1 >= items.length) qc.invalidateQueries({ queryKey: ["home"] });
              }}
            />
          </View>
        </>
      )}
    </Screen>
  );
}
