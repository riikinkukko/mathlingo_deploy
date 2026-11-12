import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { mskKey, useTAction } from "@/lib/teacher";
import { Button, Card, Header, Screen, T } from "@/components/ui";
import { Field } from "@/components/Field";
import { DateStepper } from "@/components/teacher";
import { C } from "@/theme";

/** Запись в журнал занятий (видят ученик и родители). */
export default function LogNew() {
  const p = useLocalSearchParams<{ studentId: string; date?: string; topic?: string }>();
  const { run, busy } = useTAction();
  const [date, setDate] = useState(p.date || mskKey());
  const [topic, setTopic] = useState(p.topic ?? "");
  const [report, setReport] = useState("");
  return (
    <Screen header={<Header title="Отчёт о занятии" />}>
      <Card style={{ gap: 12 }}>
        <DateStepper label="Дата занятия" value={date} onChange={setDate} max={mskKey()} />
        <Field label="Тема" value={topic} onChangeText={setTopic} maxLength={200} placeholder="например, Неравенства" />
        <Field label="Что прошли, что задано" value={report} onChangeText={setReport} multiline maxLength={5000} style={{ minHeight: 140, textAlignVertical: "top" }} />
      </Card>
      <T size={12} color={C.inkSoft}>
        Отчёт увидят ученик и родители — им придёт уведомление.
      </T>
      <Button
        title="Сохранить"
        disabled={!topic.trim() || !report.trim()}
        loading={!!busy}
        onPress={async () => {
          if (await run("createLessonLog", { studentId: p.studentId, date, topic, report })) router.back();
        }}
      />
    </Screen>
  );
}
