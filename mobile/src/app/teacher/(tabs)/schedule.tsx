import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { errorText } from "@/lib/api";
import { plural } from "@/lib/hooks";
import { addDays, dayLabel, useT } from "@/lib/teacher";
import { Button, Card, Empty, ErrorBox, Loading, Row, Screen, T } from "@/components/ui";
import { LessonCard, Section } from "@/components/teacher";
import { C } from "@/theme";

export default function TeacherSchedule() {
  const [week, setWeek] = useState<string | null>(null);
  const q = useT("schedule", { week });
  const d = q.data;
  if (q.isLoading && !d) return <Loading />;
  if (!d) return <Screen><ErrorBox message={errorText(q.error)} onRetry={() => q.refetch()} /></Screen>;
  const total = d.days.reduce((n, x) => n + x.lessons.length, 0);
  const isThisWeek = d.today >= d.weekStart && d.today < addDays(d.weekStart, 7);

  return (
    <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <Row>
        <T w="black" size={24} style={{ flex: 1 }}>
          Расписание
        </T>
        {d.students.length ? <Button title="+ Занятие" small onPress={() => router.push("/teacher/lesson-new")} /> : null}
      </Row>

      {d.students.length === 0 ? (
        <Empty title="Сначала добавьте учеников" text="Тогда сможете планировать занятия." action={<Button title="Добавить ученика" onPress={() => router.push("/teacher/student-new")} />} />
      ) : null}

      {d.unmarked.length ? (
        <>
          <Section title={`Отметьте прошедшие · ${d.unmarked.length}`} />
          <T size={13} color={C.inkSoft}>
            От «Было» зависит баланс оплат ученика.
          </T>
          {d.unmarked.map((l) => (
            <LessonCard key={l.id} lesson={l} showDay />
          ))}
        </>
      ) : null}

      <Card style={{ paddingVertical: 10 }}>
        <Row>
          <Pressable accessibilityRole="button" accessibilityLabel="Прошлая неделя" hitSlop={8} onPress={() => setWeek(addDays(d.weekStart, -7))} style={{ padding: 8 }}>
            <T w="black" size={20} color={C.inkSoft}>
              ‹
            </T>
          </Pressable>
          <View style={{ flex: 1, alignItems: "center" }}>
            <T w="black">
              {dayLabel(d.weekStart, { day: "numeric", month: "short" })} – {dayLabel(addDays(d.weekStart, 6), { day: "numeric", month: "short" })}
            </T>
            <T size={12} color={C.inkSoft}>
              {total ? `${total} ${plural(total, ["занятие", "занятия", "занятий"])}` : "занятий нет"}
            </T>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Следующая неделя" hitSlop={8} onPress={() => setWeek(addDays(d.weekStart, 7))} style={{ padding: 8 }}>
            <T w="black" size={20} color={C.inkSoft}>
              ›
            </T>
          </Pressable>
        </Row>
        {!isThisWeek ? <Button title="К текущей неделе" kind="ghost" small onPress={() => setWeek(null)} /> : null}
      </Card>

      {d.days.map((day) => (
        <View key={day.key} style={{ gap: 8 }}>
          <Row>
            <T w="black" size={15} color={day.key === d.today ? C.pineStrong : day.key < d.today ? C.inkSoft : C.ink} style={{ flex: 1 }}>
              {dayLabel(day.key, { weekday: "long", day: "numeric", month: "long" })}
              {day.key === d.today ? " · сегодня" : ""}
            </T>
            {day.key >= d.today ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Добавить занятие на этот день" hitSlop={8} onPress={() => router.push({ pathname: "/teacher/lesson-new", params: { date: day.key } })}>
                <T w="black" color={C.pineStrong}>
                  +
                </T>
              </Pressable>
            ) : null}
          </Row>
          {day.lessons.map((l) => (
            <LessonCard key={l.id} lesson={l} />
          ))}
        </View>
      ))}
    </Screen>
  );
}
