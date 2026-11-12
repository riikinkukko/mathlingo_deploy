import { useRef, useState } from "react";
import { Alert, View, useWindowDimensions } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { authedImage } from "@/lib/api";
import { relDay, timeLabel, useT, useTAction } from "@/lib/teacher";
import { Button, Card, Empty, Header, Loading, Pill, Row, Screen, T } from "@/components/ui";
import { Field } from "@/components/Field";
import { Diagram } from "@/components/Svg";
import { Chip, Chips } from "@/components/teacher";
import { PhotoMarkup, type MarkupHandle } from "@/components/PhotoMarkup";
import { C } from "@/theme";

/** Проверка одного решения: фото (с пометками), баллы, комментарий, решение. */
export default function ReviewOne() {
  const { id, studentId } = useLocalSearchParams<{ id: string; studentId?: string }>();
  const q = useT("reviews");
  const { width } = useWindowDimensions();
  const { run, busy } = useTAction();
  const [score, setScore] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const [showSolution, setShowSolution] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [marks, setMarks] = useState(0);
  const markup = useRef<MarkupHandle>(null);

  const all = (q.data?.items ?? []).filter((r) => !studentId || r.student.id === studentId);
  const r = all.find((x) => x.attemptId === id);
  const header = <Header title={r ? r.student.name : "Проверка"} subtitle={r ? `${r.problem.egeTaskNumber ? `№${r.problem.egeTaskNumber} · ` : ""}${r.skillTitle}` : undefined} />;
  if (q.isLoading && !q.data) return <Loading />;
  if (!r)
    return (
      <Screen header={header}>
        <Empty mood="happy" title="Эта работа уже проверена" action={<Button title="К очереди" onPress={() => router.back()} />} />
      </Screen>
    );

  const next = all.filter((x) => x.attemptId !== r.attemptId)[0];
  async function decide(decision: "approved" | "needs_revision") {
    if (decision === "needs_revision" && !feedback.trim()) {
      Alert.alert("Нужен комментарий", "Напишите ученику, что исправить.");
      return;
    }
    const m = await markup.current?.capture();
    const ok = await run("reviewAttempt", { attemptId: r!.attemptId, decision, feedback, markup: m ?? null, score }, { key: decision });
    if (!ok) return;
    if (next) router.replace(`/teacher/review/${next.attemptId}${studentId ? `?studentId=${studentId}` : ""}`);
    else router.back();
  }

  const photoW = width - 32;
  return (
    <Screen header={header} scrollEnabled={!drawing}>
      <Row gap={6}>
        <T size={12} color={C.inkSoft} style={{ flex: 1 }}>
          Сдано {relDay(r.submittedAt)}, {timeLabel(r.submittedAt)}
        </T>
        {r.fromMock ? <Pill text="из пробника" bg={C.amberLight} color={C.amberText} /> : null}
        {all.length > 1 ? <Pill text={`ещё ${all.length - 1}`} bg={C.violetLight} color={C.violetText} /> : null}
      </Row>
      <Card style={{ gap: 8 }}>
        <T w="extrabold" size={12} color={C.inkSoft}>
          УСЛОВИЕ
        </T>
        <T>{r.problem.text}</T>
        {r.problem.diagramSvg ? <Diagram svg={r.problem.diagramSvg} maxHeight={220} /> : null}
      </Card>

      {r.answer ? (
        <Card style={{ gap: 6 }}>
          <T w="extrabold" size={12} color={C.inkSoft}>
            ОТВЕТ УЧЕНИКА
          </T>
          <T>{r.answer}</T>
        </Card>
      ) : null}

      {r.hasImage ? (
        <View style={{ gap: 8 }}>
          <Row>
            <T w="extrabold" size={12} color={C.inkSoft} style={{ flex: 1 }}>
              ФОТО РЕШЕНИЯ
            </T>
            {marks ? <Button title="↶" kind="ghost" small onPress={() => markup.current?.undo()} /> : null}
            <Button title={drawing ? "Готово" : "Пометки"} kind={drawing ? "primary" : "secondary"} small onPress={() => setDrawing((v) => !v)} />
          </Row>
          {drawing ? (
            <T size={12} color={C.coralText}>
              Рисуйте пальцем по фото — пометки увидит ученик.
            </T>
          ) : null}
          <View style={{ borderRadius: 16, overflow: "hidden", borderWidth: drawing ? 2 : 1, borderColor: drawing ? C.coral : C.lineSoft }}>
            <PhotoMarkup ref={markup} source={authedImage(`/api/attempt-image/${r.attemptId}`)} width={photoW - (drawing ? 4 : 2)} drawing={drawing} onChange={setMarks} />
          </View>
        </View>
      ) : null}

      <Card style={{ gap: 8 }}>
        <Row>
          <T w="extrabold" size={12} color={C.inkSoft} style={{ flex: 1 }}>
            ЭТАЛОННОЕ РЕШЕНИЕ
          </T>
          <Button title={showSolution ? "Скрыть" : "Показать"} kind="ghost" small onPress={() => setShowSolution((v) => !v)} />
        </Row>
        {showSolution ? <T size={14}>{r.problem.solution}</T> : null}
      </Card>

      {r.maxPoints ? (
        <Card style={{ gap: 8 }}>
          <T w="extrabold" size={12} color={C.inkSoft}>
            БАЛЛЫ ПО КРИТЕРИЯМ (0–{r.maxPoints})
          </T>
          <Chips>
            {Array.from({ length: r.maxPoints + 1 }, (_, n) => (
              <Chip key={n} label={String(n)} on={score === n} onPress={() => setScore(score === n ? null : n)} />
            ))}
          </Chips>
          <T size={12} color={C.inkSoft}>
            Полный балл — решение принято. Можно не ставить.
          </T>
        </Card>
      ) : null}

      <Field label="Комментарий ученику" value={feedback} onChangeText={setFeedback} multiline maxLength={2000} style={{ minHeight: 90, textAlignVertical: "top" }} placeholder="Что хорошо, что исправить…" />
      <Row gap={8}>
        <Button title="На доработку" kind="secondary" style={{ flex: 1 }} loading={busy === "needs_revision"} disabled={!!busy} onPress={() => decide("needs_revision")} />
        <Button title="Принять" style={{ flex: 1 }} loading={busy === "approved"} disabled={!!busy} onPress={() => decide("approved")} />
      </Row>
    </Screen>
  );
}
