import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { mskKey, useT, useTAction } from "@/lib/teacher";
import { Button, Card, Header, Loading, Screen, T } from "@/components/ui";
import { Field } from "@/components/Field";
import { DateStepper } from "@/components/teacher";
import { C } from "@/theme";

/**
 * Отчёт о занятии (видят ученик и родители). С lessonId — о конкретном
 * занятии: тема, домашка, практика между занятиями и следующее занятие
 * подставляются в черновик сами.
 */
export default function LogNew() {
  const p = useLocalSearchParams<{ studentId: string; lessonId?: string; date?: string; topic?: string }>();
  const { run, busy } = useTAction();
  const draft = useT("reportDraft", { studentId: p.studentId, lessonId: p.lessonId });
  const [date, setDate] = useState(p.date || mskKey());
  const [topic, setTopic] = useState(p.topic ?? "");
  const [report, setReport] = useState("");
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    const d = draft.data;
    if (!d || filled) return;
    setFilled(true);
    if (p.lessonId) setDate(d.date);
    if (!topic) setTopic(d.topic);
    setReport(d.report);
  }, [draft.data, filled, p.lessonId, topic]);

  if (draft.isLoading && !filled) return <Loading />;
  return (
    <Screen header={<Header title="Отчёт о занятии" />}>
      <Card style={{ gap: 12 }}>
        {p.lessonId ? null : <DateStepper label="Дата занятия" value={date} onChange={setDate} max={mskKey()} />}
        <Field label="Тема" value={topic} onChangeText={setTopic} maxLength={200} placeholder="например, Неравенства" />
        <Field label="Отчёт" value={report} onChangeText={setReport} multiline maxLength={5000} style={{ minHeight: 200, textAlignVertical: "top" }} />
      </Card>
      <T size={12} color={C.inkSoft}>
        Допишите строки шаблона — пустые в отчёт не попадут. Домашка, практика и следующее занятие собраны автоматически. Отчёт придёт ученику и родителям.
      </T>
      <Button
        title="Отправить"
        disabled={!topic.trim() || !report.trim()}
        loading={!!busy}
        onPress={async () => {
          if (await run("createLessonLog", { studentId: p.studentId, lessonId: p.lessonId, date, topic, report })) router.back();
        }}
      />
    </Screen>
  );
}
