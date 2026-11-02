import { View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api, errorText } from "@/lib/api";
import type { HomeworkItem } from "@/lib/types";
import { Card, Empty, ErrorBox, Header, Loading, Pill, ProgressBar, Row, Screen, T } from "@/components/ui";
import { dateLabel } from "@/lib/mock-format";
import { C } from "@/theme";

const KIND: Record<HomeworkItem["kind"], string> = { homework: "Домашка", test: "Контрольная", exam: "Пробник" };

export default function HomeworkList() {
  const q = useQuery({ queryKey: ["homework"], queryFn: () => api<{ items: HomeworkItem[] }>("/api/m/homework") });
  if (q.isLoading && !q.data) return <Loading />;
  const header = <Header title="Задания репетитора" />;
  if (!q.data) return <Screen header={header}><ErrorBox message={errorText(q.error)} onRetry={() => q.refetch()} /></Screen>;
  const open = q.data.items.filter((h) => !h.complete);
  const done = q.data.items.filter((h) => h.complete);
  return (
    <Screen header={header} onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      {q.data.items.length === 0 ? <Empty mood="idle" title="Заданий пока нет" text="Когда репетитор задаст домашку, она появится здесь, и придёт уведомление." /> : null}
      {open.map((h) => <HwCard key={h.id} h={h} />)}
      {done.length ? (
        <T w="extrabold" size={13} color={C.inkSoft} style={{ marginTop: 8 }}>
          Выполнено
        </T>
      ) : null}
      {done.map((h) => <HwCard key={h.id} h={h} />)}
    </Screen>
  );
}

function HwCard({ h }: { h: HomeworkItem }) {
  return (
    <Card onPress={() => router.push(`/homework/${h.id}`)} style={{ gap: 8, opacity: h.complete ? 0.75 : 1 }}>
      <Row style={{ justifyContent: "space-between" }}>
        <Pill text={KIND[h.kind] ?? "Задание"} bg={h.kind === "homework" ? C.pineLight : C.violetLight} color={h.kind === "homework" ? C.pineDark : C.violetText} />
        <T w="bold" size={12} color={h.overdue && !h.complete ? C.coralText : C.inkSoft}>
          {h.complete ? "готово" : h.overdue ? "срок прошёл" : `до ${dateLabel(h.dueDate)}`}
        </T>
      </Row>
      <T w="black" size={16}>
        {h.title}
      </T>
      <View style={{ gap: 4 }}>
        <ProgressBar pct={h.total ? (h.done / h.total) * 100 : 0} />
        <T size={12} color={C.inkSoft}>
          {h.done} из {h.total}
          {h.timeLimitMinutes ? ` · на время: ${h.timeLimitMinutes} мин` : ""}
        </T>
      </View>
    </Card>
  );
}
