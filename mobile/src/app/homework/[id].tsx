import { useEffect, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorText } from "@/lib/api";
import type { HomeworkDetail } from "@/lib/types";
import { Card, ErrorBox, Header, Loading, ProgressBar, Row, Screen, T } from "@/components/ui";
import ProblemCard from "@/components/ProblemCard";
import { dateLabel, formatDuration } from "@/lib/mock-format";
import { C } from "@/theme";

export default function HomeworkScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["homework", id], queryFn: () => api<HomeworkDetail>(`/api/m/homework/${id}`) });
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (q.isLoading && !q.data) return <Loading />;
  if (!q.data) return <Screen header={<Header title="Задание" />}><ErrorBox message={errorText(q.error)} onRetry={() => q.refetch()} /></Screen>;
  const d = q.data;
  const left = d.deadlineAt ? Math.round((new Date(d.deadlineAt).getTime() - now) / 1000) : null;
  const refresh = () => {
    q.refetch();
    qc.invalidateQueries({ queryKey: ["homework"], exact: true });
    qc.invalidateQueries({ queryKey: ["home"] });
  };

  return (
    <Screen header={<Header title={d.homework.title} subtitle={`до ${dateLabel(d.homework.dueDate)}`} />} onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <Card style={{ gap: 8 }}>
        <Row style={{ justifyContent: "space-between" }}>
          <T w="black">
            Решено {d.status.done} из {d.status.total}
          </T>
          {left !== null ? (
            <T w="black" color={left < 300 ? C.coralText : C.pineStrong} style={{ fontVariant: ["tabular-nums"] }}>
              {left > 0 ? formatDuration(left) : "время вышло"}
            </T>
          ) : null}
        </Row>
        <ProgressBar pct={d.status.total ? (d.status.done / d.status.total) * 100 : 0} />
        {!d.homework.allowHints ? (
          <T size={12} color={C.inkSoft}>
            Подсказки отключены репетитором. Ответы проверяются только онлайн.
          </T>
        ) : null}
      </Card>
      {d.items.map((it, i) => (
        <View key={it.problem.id} style={{ gap: 6 }}>
          <T w="bold" size={12} color={C.inkSoft}>
            Задача {i + 1} · {it.skillTitle}
          </T>
          <ProblemCard problem={it.problem} state={it.state} source="assignment" allowHints={d.homework.allowHints} canAskTeacher onSolved={refresh} />
        </View>
      ))}
    </Screen>
  );
}
