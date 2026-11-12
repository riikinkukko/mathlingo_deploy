import { useState } from "react";
import { Image, View, useWindowDimensions } from "react-native";
import { authedImage, errorText } from "@/lib/api";
import { relDay, useT, useTAction, type TQuestion } from "@/lib/teacher";
import { Button, Card, Empty, ErrorBox, Header, Loading, Pill, Row, Screen, T } from "@/components/ui";
import { Field } from "@/components/Field";
import { Seg } from "@/components/teacher";
import { C } from "@/theme";

function QuestionCard({ q }: { q: TQuestion }) {
  const { run, busy } = useTAction();
  const [answer, setAnswer] = useState("");
  const [sketch, setSketch] = useState(false);
  const { width } = useWindowDimensions();
  return (
    <Card style={{ gap: 8 }}>
      <Row>
        <T w="black" style={{ flex: 1 }}>
          {q.studentName}
        </T>
        {q.egeTaskNumber ? <Pill text={`№${q.egeTaskNumber}`} bg={C.violetLight} color={C.violetText} /> : null}
        <T size={12} color={C.inkSoft}>
          {relDay(q.createdAt)}
        </T>
      </Row>
      <T size={13} color={C.inkSoft} numberOfLines={4}>
        {q.problemText}
      </T>
      {q.studentAnswer ? (
        <T size={13}>
          Ответ ученика: <T w="black">{q.studentAnswer}</T>
        </T>
      ) : null}
      <View style={{ backgroundColor: C.paper, borderRadius: 14, padding: 10 }}>
        <T>{q.message}</T>
      </View>
      {q.hasSketch ? (
        sketch ? (
          <Image source={authedImage(`/api/question-sketch/${q.id}`)} style={{ width: width - 64, height: (width - 64) * 1.2, borderRadius: 12 }} resizeMode="contain" />
        ) : (
          <Button title="Показать черновик" kind="ghost" small onPress={() => setSketch(true)} />
        )
      ) : null}
      {q.answer ? (
        <View style={{ backgroundColor: C.pineLight, borderRadius: 14, padding: 10, gap: 2 }}>
          <T w="extrabold" size={12} color={C.pineDark}>
            Ваш ответ
          </T>
          <T>{q.answer}</T>
        </View>
      ) : (
        <>
          <Field label="Ответ" value={answer} onChangeText={setAnswer} multiline maxLength={3000} style={{ minHeight: 70, textAlignVertical: "top" }} />
          <Button title="Ответить" small disabled={!answer.trim()} loading={busy === "answerQuestion"} onPress={() => run("answerQuestion", { questionId: q.id, answer })} />
        </>
      )}
    </Card>
  );
}

export default function TeacherQuestions() {
  const q = useT("questions");
  const [tab, setTab] = useState<"open" | "done">("open");
  const header = <Header title="Вопросы учеников" />;
  if (q.isLoading && !q.data) return <Loading />;
  if (!q.data) return <Screen header={header}><ErrorBox message={errorText(q.error)} onRetry={() => q.refetch()} /></Screen>;
  const open = q.data.questions.filter((x) => !x.answeredAt);
  const list = tab === "open" ? open : q.data.questions.filter((x) => x.answeredAt);
  return (
    <Screen header={header} onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <Seg value={tab} onChange={setTab} items={[["open", `Ждут ответа · ${open.length}`], ["done", "Отвеченные"]]} />
      {list.length === 0 ? <Empty mood="happy" title={tab === "open" ? "Новых вопросов нет" : "Пока пусто"} text="Ученики задают вопросы прямо из задачи." /> : null}
      {list.map((x) => (
        <QuestionCard key={x.id} q={x} />
      ))}
    </Screen>
  );
}
