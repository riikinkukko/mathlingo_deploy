import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { errorText } from "@/lib/api";
import { plural } from "@/lib/hooks";
import { relDay, timeLabel, useT } from "@/lib/teacher";
import { Button, Card, Empty, ErrorBox, Loading, Pill, Row, Screen, T } from "@/components/ui";
import { C } from "@/theme";

/** Очередь проверки развёрнутых решений. */
export default function TeacherReviews() {
  const { studentId } = useLocalSearchParams<{ studentId?: string }>();
  const q = useT("reviews");
  const all = q.data?.items ?? [];
  const items = studentId ? all.filter((r) => r.student.id === studentId) : all;
  if (q.isLoading && !q.data) return <Loading />;
  if (!q.data) return <Screen><ErrorBox message={errorText(q.error)} onRetry={() => q.refetch()} /></Screen>;
  return (
    <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <T w="black" size={24}>
        Проверка
      </T>
      <T color={C.inkSoft} size={13}>
        {items.length ? `${items.length} ${plural(items.length, ["работа ждёт", "работы ждут", "работ ждут"])} проверки — сначала самые давние.` : ""}
      </T>
      {studentId && items.length !== all.length ? <Button title="Показать всех учеников" kind="ghost" small onPress={() => router.setParams({ studentId: undefined })} /> : null}
      {items.length ? <Button title="Начать проверку" onPress={() => router.push(`/teacher/review/${items[0].attemptId}${studentId ? `?studentId=${studentId}` : ""}`)} /> : null}
      {items.length === 0 ? <Empty mood="happy" title="Всё проверено" text="Новые решения второй части появятся здесь, а на телефон придёт уведомление." /> : null}
      {items.map((r) => (
        <Card key={r.attemptId} onPress={() => router.push(`/teacher/review/${r.attemptId}${studentId ? `?studentId=${studentId}` : ""}`)} style={{ gap: 4 }}>
          <Row>
            <T w="black" style={{ flex: 1 }} numberOfLines={1}>
              {r.student.name}
            </T>
            {r.problem.egeTaskNumber ? <Pill text={`№${r.problem.egeTaskNumber}`} bg={C.violetLight} color={C.violetText} /> : null}
            {r.fromMock ? <Pill text="пробник" bg={C.amberLight} color={C.amberText} /> : null}
          </Row>
          <T size={13} color={C.inkSoft} numberOfLines={2}>
            {r.problem.text}
          </T>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <T size={12} color={C.inkSoft}>
              {relDay(r.submittedAt)}, {timeLabel(r.submittedAt)}
              {r.hasImage ? " · фото решения" : ""}
            </T>
          </View>
        </Card>
      ))}
    </Screen>
  );
}
