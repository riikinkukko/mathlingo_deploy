import { View } from "react-native";
import { router } from "expo-router";
import { errorText } from "@/lib/api";
import { useT } from "@/lib/teacher";
import { Button, Card, Empty, ErrorBox, Header, Loading, Row, Screen, T } from "@/components/ui";
import { C } from "@/theme";

export default function TeacherGroups() {
  const q = useT("groups");
  const header = <Header title="Группы" right={q.data && q.data.students.length >= 2 ? <Button title="+ Группа" small onPress={() => router.push("/teacher/group-edit")} /> : undefined} />;
  if (q.isLoading && !q.data) return <Loading />;
  if (!q.data) return <Screen header={header}><ErrorBox message={errorText(q.error)} onRetry={() => q.refetch()} /></Screen>;
  return (
    <Screen header={header} onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      {q.data.groups.length === 0 ? (
        <Empty
          title="Групп пока нет"
          text={q.data.students.length >= 2 ? "Группа — несколько учеников, которым вы ставите общие занятия и задания." : "Для группы нужно хотя бы два ученика."}
          action={q.data.students.length >= 2 ? <Button title="Создать группу" onPress={() => router.push("/teacher/group-edit")} /> : undefined}
        />
      ) : null}
      {q.data.groups.map((g) => (
        <Card key={g.id} onPress={() => router.push(`/teacher/group/${g.id}`)}>
          <Row>
            <View style={{ flex: 1 }}>
              <T w="black">{g.name}</T>
              <T size={12} color={C.inkSoft} numberOfLines={2}>
                {g.members.map((m) => m.name).join(", ") || "нет учеников"}
              </T>
            </View>
            <T w="black" color={C.inkSoft}>
              ›
            </T>
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
