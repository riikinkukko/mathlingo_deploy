import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { errorText } from "@/lib/api";
import { mskKey, timeLabel, useT, useTAction } from "@/lib/teacher";
import { Button, Card, ErrorBox, Header, Loading, Screen, T } from "@/components/ui";
import { Field } from "@/components/Field";
import { Chip, Chips, DateStepper, Seg, TimeStepper } from "@/components/teacher";
import { C } from "@/theme";

const DURATIONS = [45, 60, 90, 120];
const REPEATS: [number, string][] = [
  [1, "Один раз"],
  [4, "4 нед."],
  [8, "8 нед."],
  [12, "12 нед."],
  [24, "Полгода"],
];

/** Новое занятие или перенос (lessonId). */
export default function LessonNew() {
  const p = useLocalSearchParams<{ studentId?: string; groupId?: string; date?: string; lessonId?: string; startsAt?: string; durationMin?: string; series?: string; group?: string; title?: string }>();
  const move = !!p.lessonId;
  const { run, busy } = useTAction();
  const sched = useT("schedule", { week: null }, !move);
  const [target, setTarget] = useState(p.groupId ? `g:${p.groupId}` : p.studentId ?? "");
  const [date, setDate] = useState(p.startsAt ? mskKey(new Date(p.startsAt)) : p.date ?? mskKey());
  const [time, setTime] = useState(p.startsAt ? timeLabel(p.startsAt) : "16:00");
  const [dur, setDur] = useState(Number(p.durationMin) || 60);
  const [repeat, setRepeat] = useState(1);
  const [topic, setTopic] = useState("");
  const [scope, setScope] = useState<"one" | "following">("one");

  async function save() {
    const startsAt = `${date}T${time}`;
    const r = move
      ? await run("rescheduleLesson", { lessonId: p.lessonId, startsAt, durationMin: dur, scope, wholeGroup: p.group ? "1" : undefined })
      : await run("createLesson", { studentId: target, startsAt, durationMin: dur, repeatWeeks: repeat, topic });
    if (r) router.back();
  }

  const header = <Header title={move ? "Перенести занятие" : "Новое занятие"} subtitle={move ? p.title : undefined} />;
  if (!move && sched.isLoading && !sched.data) return <Loading />;
  if (!move && !sched.data) return <Screen header={header}><ErrorBox message={errorText(sched.error)} onRetry={() => sched.refetch()} /></Screen>;
  const d = sched.data;

  return (
    <Screen header={header}>
      {!move && d ? (
        <Card style={{ gap: 8 }}>
          <T w="extrabold" size={13} color={C.inkSoft}>
            С кем
          </T>
          <Chips>
            {d.groups.filter((g) => g.count > 0).map((g) => (
              <Chip key={g.id} label={`👥 ${g.name}`} color={C.violet} on={target === `g:${g.id}`} onPress={() => setTarget(`g:${g.id}`)} />
            ))}
            {d.students.map((s) => (
              <Chip key={s.id} label={s.name} on={target === s.id} onPress={() => setTarget(s.id)} />
            ))}
          </Chips>
        </Card>
      ) : null}
      <Card style={{ gap: 14 }}>
        <DateStepper label="День" value={date} onChange={setDate} />
        <TimeStepper value={time} onChange={setTime} />
        <View style={{ gap: 6 }}>
          <T w="extrabold" size={13} color={C.inkSoft}>
            Длительность
          </T>
          <Chips>
            {DURATIONS.map((m) => (
              <Chip key={m} label={`${m} мин`} on={dur === m} onPress={() => setDur(m)} />
            ))}
          </Chips>
        </View>
      </Card>
      {move ? (
        p.series ? (
          <Card style={{ gap: 8 }}>
            <T w="extrabold" size={13} color={C.inkSoft}>
              Это занятие из еженедельной серии
            </T>
            <Seg value={scope} onChange={setScope} items={[["one", "Только это"], ["following", "Это и следующие"]]} />
          </Card>
        ) : null
      ) : (
        <Card style={{ gap: 10 }}>
          <T w="extrabold" size={13} color={C.inkSoft}>
            Повторять каждую неделю
          </T>
          <Chips>
            {REPEATS.map(([n, l]) => (
              <Chip key={n} label={l} on={repeat === n} onPress={() => setRepeat(n)} />
            ))}
          </Chips>
          <Field label="Тема (необязательно)" value={topic} onChangeText={setTopic} placeholder="например, Параметры" maxLength={200} />
        </Card>
      )}
      {move ? (
        <T size={12} color={C.inkSoft}>
          Ученику придёт уведомление о новом времени.
        </T>
      ) : null}
      <Button title={move ? "Перенести" : "Запланировать"} disabled={!move && !target} loading={!!busy} onPress={save} />
    </Screen>
  );
}
