import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { errorText } from "@/lib/api";
import { confirm, dayLabel, KIND_LABEL, useT, useTAction } from "@/lib/teacher";
import { Button, Card, ErrorBox, Header, Loading, Pill, Row, Screen, T } from "@/components/ui";
import { LessonCard, Section } from "@/components/teacher";
import { C } from "@/theme";

export default function TeacherGroup() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useT("group", { id });
  const { run } = useTAction();
  const d = q.data;
  const header = <Header title={d ? `Группа «${d.group.name}»` : "Группа"} right={d ? <Button title="Изменить" kind="ghost" small onPress={() => router.push({ pathname: "/teacher/group-edit", params: { id } })} /> : undefined} />;
  if (q.isLoading && !d) return <Loading />;
  if (!d) return <Screen header={header}><ErrorBox message={errorText(q.error)} onRetry={() => q.refetch()} /></Screen>;
  return (
    <Screen header={header} onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {d.group.members.map((m) => (
          <Pill key={m.id} text={m.name} bg={C.violetLight} color={C.violetText} />
        ))}
      </View>
      <Row gap={8}>
        <Button title="+ Занятие" style={{ flex: 1 }} onPress={() => router.push({ pathname: "/teacher/lesson-new", params: { groupId: id } })} />
        <Button title="+ Задание" kind="secondary" style={{ flex: 1 }} onPress={() => router.push({ pathname: "/teacher/homework-new", params: { groupId: id } })} />
      </Row>
      {d.unmarked.length ? <Section title="Отметьте прошедшие" /> : null}
      {d.unmarked.map((l) => (
        <LessonCard key={l.id} lesson={l} showDay from="group" />
      ))}
      <Section title="Ближайшие занятия" />
      {d.upcoming.length ? (
        d.upcoming.map((l) => <LessonCard key={l.id} lesson={l} showDay from="group" />)
      ) : (
        <T size={13} color={C.inkSoft}>
          Запланированных занятий нет.
        </T>
      )}
      <Section title="Задания группе" />
      {d.homeworks.length ? (
        d.homeworks.map((h) => (
          <Card key={h.batchId} style={{ gap: 6 }}>
            <T w="black">{h.title}</T>
            <T size={12} color={C.inkSoft}>
              {KIND_LABEL[h.kind] ?? "Задание"} · до {dayLabel(h.dueDate.slice(0, 10), { day: "numeric", month: "long" })}
            </T>
            {h.rows.map((r) => (
              <Row key={r.studentId}>
                <T size={13} style={{ flex: 1 }}>
                  {r.name}
                </T>
                <Pill
                  text={`${r.done}/${r.total}`}
                  bg={r.done >= r.total ? C.pineLight : r.overdue ? C.coralLight : C.paper}
                  color={r.done >= r.total ? C.pineDark : r.overdue ? C.coralText : C.inkSoft}
                />
              </Row>
            ))}
          </Card>
        ))
      ) : (
        <T size={13} color={C.inkSoft}>
          Заданий группе пока не было.
        </T>
      )}
      <Button
        title="Удалить группу"
        kind="ghost"
        onPress={() =>
          confirm("Удалить группу?", "Ученики останутся, проведённые занятия и задания — тоже.", "Удалить", async () => {
            if (await run("deleteGroup", { groupId: id })) router.back();
          })
        }
      />
    </Screen>
  );
}
