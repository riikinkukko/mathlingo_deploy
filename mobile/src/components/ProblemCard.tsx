import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Animated, Image, Modal, Pressable, ScrollView, Switch, TextInput, View, useWindowDimensions } from "react-native";
import Reanimated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { captureRef } from "react-native-view-shot";
import Svg, { Path } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import { C, F, R } from "@/theme";
import { api, errorText } from "@/lib/api";
import { submitAnswer, type SubmitResult } from "@/lib/attempt-queue";
import { pickSolutionPhoto } from "@/lib/image";
import { loadSketch, type SketchItem } from "@/lib/sketch";
import type { MobileProblem, ProblemStateM } from "@/lib/types";
import { Button, Card, Pill, Row, T } from "./ui";
import { Diagram, Icon, Mascot } from "./Svg";
import { Confetti, Pop, PressScale } from "./motion";
import Scratchpad, { SketchSheet, type ViewRef } from "./Scratchpad";

type Source = "lesson" | "assignment" | "review";

type Feedback =
  | { kind: "correct"; explanation: string; correctAnswer: string; offline?: boolean; selfChecked?: boolean }
  | { kind: "wrong"; hint: string; wrongCount: number; canReveal: boolean; offline?: boolean }
  | { kind: "pending" }
  | { kind: "no_energy"; emailUnverified?: boolean }
  | { kind: "error"; message: string };

/**
 * Задача: условие, чертёж, ввод ответа и разбор. Одна на урок, повторение,
 * ошибки и домашку. Без сети ответ проверяется по отпечатку и уходит на
 * сервер позже (lib/attempt-queue.ts).
 */
export default function ProblemCard({
  problem,
  state,
  source,
  allowHints = true,
  canAskTeacher = false,
  onSolved,
  onSubmitted,
}: {
  problem: MobileProblem;
  state?: ProblemStateM;
  source: Source;
  allowHints?: boolean;
  canAskTeacher?: boolean;
  onSolved?: () => void;
  onSubmitted?: (r: SubmitResult) => void;
}) {
  const initial: Feedback | null =
    state?.status === "solved" && state.solvedInfo
      ? { kind: "correct", explanation: state.solvedInfo.explanation, correctAnswer: state.solvedInfo.correctAnswer }
      : state?.status === "pending"
        ? { kind: "pending" }
        : null;
  const [answer, setAnswer] = useState("");
  const [choice, setChoice] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(initial);
  const [formulaOpen, setFormulaOpen] = useState(false);
  const [sketchOpen, setSketchOpen] = useState(false);
  const [hasSketch, setHasSketch] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [asked, setAsked] = useState(false);
  const [burst, setBurst] = useState(0);
  const [cardW, setCardW] = useState(320);
  const shake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let alive = true;
    loadSketch(problem.id).then((d) => alive && setHasSketch(!!d?.items.length));
    return () => {
      alive = false;
    };
  }, [problem.id]);
  const onSketchChange = useCallback((v: boolean) => setHasSketch(v), []);

  useEffect(() => {
    setAnswer("");
    setChoice(null);
    setPhoto(null);
    setFeedback(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problem.id]);

  const solved = feedback?.kind === "correct";
  const isDetailed = problem.answerType === "DETAILED";
  const needsRevision = state?.status === "needs_revision" && !feedback;

  function doShake() {
    Animated.sequence(
      [8, -7, 5, -3, 0].map((v) => Animated.timing(shake, { toValue: v, duration: 55, useNativeDriver: true }))
    ).start();
  }

  async function submit(): Promise<"correct" | "wrong" | "other"> {
    const value = problem.answerType === "CHOICE" ? choice ?? "" : answer.trim();
    if (!value && !(isDetailed && photo)) return "other";
    setBusy(true);
    try {
      const r = await submitAnswer(problem, value, source, isDetailed ? photo : null);
      onSubmitted?.(r);
      if (r.kind === "correct") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setFeedback({ kind: "correct", explanation: r.explanation, correctAnswer: r.correctAnswer, offline: r.offline, selfChecked: r.selfChecked });
        if (!r.selfChecked) setBurst((b) => b + 1);
        onSolved?.();
        return "correct";
      } else if (r.kind === "wrong") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        doShake();
        setFeedback({ kind: "wrong", hint: allowHints ? r.hint : "", wrongCount: r.wrongCount, canReveal: r.canRevealSolution, offline: r.offline });
        return "wrong";
      } else if (r.kind === "pending") {
        setFeedback({ kind: "pending" });
        onSolved?.();
      } else {
        setFeedback({ kind: "no_energy", emailUnverified: r.emailUnverified });
      }
    } catch (e) {
      setFeedback({ kind: "error", message: errorText(e) });
    } finally {
      setBusy(false);
    }
    return "other";
  }

  async function reveal() {
    setBusy(true);
    try {
      const r = await api<{ explanation: string; correctAnswer: string }>("/api/m/reveal", { body: { problemId: problem.id } });
      setFeedback({ kind: "correct", explanation: r.explanation, correctAnswer: r.correctAnswer });
    } catch (e) {
      Alert.alert("Не получилось", errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function attachPhoto(fromCamera: boolean) {
    try {
      const res = await pickSolutionPhoto(fromCamera);
      if (res === "denied") Alert.alert("Нет доступа к камере", "Разреши доступ в настройках телефона или выбери фото из галереи.");
      else if (res) setPhoto(res);
    } catch {
      Alert.alert("Фото не подошло", "Попробуй другое фото.");
    }
  }

  function appendKey(k: string) {
    if (k === "±") setAnswer((a) => (a.startsWith("-") ? a.slice(1) : `-${a}`));
    else setAnswer((a) => a + k);
  }

  return (
    <View style={{ gap: 12 }} onLayout={(e) => setCardW(e.nativeEvent.layout.width)}>
      <Row style={{ justifyContent: "space-between" }}>
        {problem.egeTaskNumber ? <Pill text={`№${problem.egeTaskNumber} ЕГЭ`} bg={C.amberLight} color={C.amberText} /> : <View />}
        <Row gap={14}>
          {!problem.diagramSvg ? (
            <Pressable onPress={() => setSketchOpen(true)} hitSlop={8} accessibilityLabel="Открыть черновик">
              <Row gap={4}>
                <PencilIcon color={C.pineStrong} />
                <T w="extrabold" size={13} color={C.pineStrong}>
                  {hasSketch ? "Черновик ●" : "Черновик"}
                </T>
              </Row>
            </Pressable>
          ) : null}
          {problem.keyFormula && allowHints ? (
            <Pressable onPress={() => setFormulaOpen((v) => !v)} hitSlop={8}>
              <Row gap={4}>
                <Icon name="Lightbulb" size={16} color={C.pineStrong} />
                <T w="extrabold" size={13} color={C.pineStrong}>
                  {formulaOpen ? "Скрыть формулу" : "Формула"}
                </T>
              </Row>
            </Pressable>
          ) : null}
        </Row>
      </Row>

      {formulaOpen && problem.keyFormula ? (
        <View style={{ backgroundColor: C.pineLight, borderRadius: 14, padding: 12 }}>
          <T w="bold" color={C.pineDark}>
            {problem.keyFormula}
          </T>
        </View>
      ) : null}

      {problem.diagramSvg ? (
        <View style={{ gap: 6 }}>
          <PressScale onPress={() => setSketchOpen(true)} scaleTo={0.98} accessibilityLabel="Открыть черновик на чертеже">
            <Diagram svg={problem.diagramSvg} />
            <View style={{ position: "absolute", right: 10, top: 10, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: C.white, borderRadius: 12, borderWidth: 1, borderColor: C.line, paddingHorizontal: 9, height: 32 }}>
              <PencilIcon color={C.inkSoft} />
              <T w="extrabold" size={12} color={C.inkSoft}>
                Черновик
              </T>
            </View>
            {hasSketch ? (
              <View style={{ position: "absolute", left: 10, top: 10 }}>
                <Pill text="есть пометки" bg={C.coralLight} color={C.coralText} />
              </View>
            ) : null}
          </PressScale>
          <T w="bold" size={12} color={C.inkSoft}>
            {hasSketch ? "Пометки сохранены — нажми, чтобы продолжить" : "Нажми на чертёж, чтобы чертить и решать"}
          </T>
        </View>
      ) : null}

      <T w="semibold" size={17} style={{ lineHeight: 25 }} selectable>
        {problem.text}
      </T>

      {needsRevision ? (
        <Card style={{ backgroundColor: C.coralLight, borderColor: C.coralLight, gap: 4 }}>
          <T w="extrabold" color={C.coralText}>
            Репетитор просит доработать
            {state?.review?.score != null && state.review.maxScore != null ? ` · ${state.review.score} из ${state.review.maxScore}` : ""}
          </T>
          {state?.feedback ? <T color={C.ink}>{state.feedback}</T> : null}
        </Card>
      ) : null}

      {!solved && feedback?.kind !== "pending" ? (
        <Animated.View style={{ transform: [{ translateX: shake }], gap: 10 }}>
          {problem.answerType === "CHOICE" && problem.choices ? (
            <View style={{ gap: 8 }}>
              {problem.choices.map((c) => {
                const active = choice === c.id;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => setChoice(c.id)}
                    style={{
                      borderWidth: 2,
                      borderColor: active ? C.pine : C.line,
                      backgroundColor: active ? C.pineLight : C.white,
                      borderRadius: R.input,
                      padding: 14,
                    }}
                  >
                    <T w="bold">{c.text}</T>
                  </Pressable>
                );
              })}
            </View>
          ) : isDetailed ? (
            <View style={{ gap: 10 }}>
              <T size={13} color={C.inkSoft}>
                Реши в тетради и сфотографируй решение.{" "}
                {canAskTeacher ? "Его проверит репетитор." : "После отправки сравнишь с эталоном."}
              </T>
              {photo ? (
                <View style={{ borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: C.line }}>
                  <Image source={{ uri: photo }} style={{ width: "100%", height: 240 }} resizeMode="contain" />
                  <Row style={{ padding: 8, justifyContent: "space-between" }}>
                    <Button title="Переснять" kind="secondary" small onPress={() => attachPhoto(true)} />
                    <Button title="Убрать" kind="ghost" small onPress={() => setPhoto(null)} />
                  </Row>
                </View>
              ) : (
                <Row>
                  <Button title="Камера" kind="secondary" style={{ flex: 1 }} onPress={() => attachPhoto(true)} />
                  <Button title="Галерея" kind="secondary" style={{ flex: 1 }} onPress={() => attachPhoto(false)} />
                </Row>
              )}
              <TextInput
                value={answer}
                onChangeText={setAnswer}
                placeholder="Или запиши решение текстом"
                placeholderTextColor={C.inkSoft}
                multiline
                style={{
                  minHeight: 90,
                  borderWidth: 2,
                  borderColor: C.line,
                  borderRadius: R.input,
                  padding: 12,
                  fontFamily: F.regular,
                  fontSize: 15,
                  color: C.ink,
                  backgroundColor: C.white,
                  textAlignVertical: "top",
                }}
              />
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              <TextInput
                value={answer}
                onChangeText={setAnswer}
                placeholder="Ответ"
                placeholderTextColor="#9DB5A8"
                keyboardType="numbers-and-punctuation"
                returnKeyType="done"
                onSubmitEditing={submit}
                autoCorrect={false}
                accessibilityLabel="Ответ"
                style={{
                  borderWidth: 2,
                  borderColor: feedback?.kind === "wrong" ? C.coral : C.pine,
                  borderRadius: R.input,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  fontFamily: F.black,
                  fontSize: 22,
                  color: C.ink,
                  backgroundColor: C.white,
                }}
              />
              <Row gap={8}>
                {["±", ",", "/", "°"].map((k) => (
                  <Pressable
                    key={k}
                    onPress={() => appendKey(k)}
                    accessibilityLabel={k === "±" ? "Минус" : k}
                    style={{ flex: 1, height: 42, borderRadius: 12, borderWidth: 2, borderColor: C.line, backgroundColor: C.white, alignItems: "center", justifyContent: "center" }}
                  >
                    <T w="black" size={18} color={C.inkSoft}>
                      {k}
                    </T>
                  </Pressable>
                ))}
              </Row>
            </View>
          )}

          <Button
            title={isDetailed ? "Отправить решение" : "Проверить"}
            onPress={() => void submit()}
            loading={busy}
            disabled={problem.answerType === "CHOICE" ? !choice : isDetailed ? !photo && !answer.trim() : !answer.trim()}
          />
        </Animated.View>
      ) : null}

      {feedback ? (
        <Reanimated.View key={`${feedback.kind}-${burst}`} entering={FadeInDown.springify().damping(16)}>
          <FeedbackPanel feedback={feedback} onReveal={reveal} busy={busy} />
        </Reanimated.View>
      ) : null}

      {canAskTeacher && feedback?.kind !== "pending" ? (
        asked ? (
          <T w="bold" size={13} color={C.pineStrong} style={{ textAlign: "center" }}>
            Вопрос отправлен репетитору — ответ придёт уведомлением
          </T>
        ) : (
          <Pressable onPress={() => setAskOpen(true)} style={{ alignSelf: "center", paddingVertical: 6, paddingHorizontal: 10 }}>
            <T w="extrabold" size={14} color={C.inkSoft}>
              Не понял — спросить репетитора
            </T>
          </Pressable>
        )
      ) : null}

      <Confetti burst={burst} x={cardW / 2} y={40} />

      {sketchOpen ? (
        <Scratchpad
          problemId={problem.id}
          diagramSvg={problem.diagramSvg}
          problemText={problem.text}
          onClose={() => setSketchOpen(false)}
          onChange={onSketchChange}
          answerBar={
            problem.answerType === "CHOICE"
              ? undefined
              : { value: answer, onChange: setAnswer, onSubmit: submit, detailed: isDetailed, disabled: solved || feedback?.kind === "pending" }
          }
        />
      ) : null}
      {askOpen ? (
        <AskTeacher
          problem={problem}
          answer={problem.answerType === "CHOICE" ? choice ?? "" : answer}
          hasSketch={hasSketch}
          onClose={() => setAskOpen(false)}
          onSent={() => {
            setAskOpen(false);
            setAsked(true);
          }}
        />
      ) : null}
    </View>
  );
}

function PencilIcon({ color }: { color: string }) {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24">
      <Path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** «Не понял — спросить репетитора»: вопрос с условием, ответом и (по желанию) снимком черновика. */
function AskTeacher({
  problem,
  answer,
  hasSketch,
  onClose,
  onSent,
}: {
  problem: MobileProblem;
  answer: string;
  hasSketch: boolean;
  onClose: () => void;
  onSent: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const qc = useQueryClient();
  const [message, setMessage] = useState("");
  const [attach, setAttach] = useState(true);
  const [items, setItems] = useState<SketchItem[] | null>(null);
  const [sending, setSending] = useState(false);
  const sheetRef = useRef<ViewRef>(null);

  useEffect(() => {
    if (!hasSketch) return;
    loadSketch(problem.id).then((d) => setItems(d?.items ?? null));
  }, [hasSketch, problem.id]);

  async function send() {
    setSending(true);
    try {
      let sketch: string | null = null;
      if (attach && items?.length && sheetRef.current) {
        sketch = await captureRef(sheetRef, { format: "jpg", quality: 0.8, result: "data-uri" }).catch(() => null);
      }
      await api("/api/m/questions", { body: { problemId: problem.id, message, answer, sketch }, timeoutMs: 30_000 });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      qc.invalidateQueries({ queryKey: ["questions"] });
      onSent();
    } catch (e) {
      Alert.alert("Не отправилось", errorText(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(19,42,32,0.4)" }} onPress={onClose} />
      <View style={{ backgroundColor: C.white, borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: "88%", paddingBottom: insets.bottom + 14 }}>
        <ScrollView contentContainerStyle={{ padding: 18, gap: 12 }} keyboardShouldPersistTaps="handled">
          <Row>
            <Mascot mood="thinking" size={46} />
            <View style={{ flex: 1 }}>
              <T w="black" size={18}>
                Спросить репетитора
              </T>
              <T size={13} color={C.inkSoft}>
                Он увидит условие задачи{answer.trim() ? " и твой ответ" : ""}.
              </T>
            </View>
          </Row>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Что именно непонятно? (можно не писать)"
            placeholderTextColor={C.inkSoft}
            multiline
            maxLength={1000}
            style={{ minHeight: 96, borderWidth: 2, borderColor: C.line, borderRadius: R.input, padding: 12, fontFamily: F.regular, fontSize: 15, color: C.ink, textAlignVertical: "top" }}
          />
          {items?.length ? (
            <View style={{ gap: 8 }}>
              <Row style={{ justifyContent: "space-between" }}>
                <T w="extrabold">Приложить черновик</T>
                <Switch value={attach} onValueChange={setAttach} trackColor={{ true: C.pine, false: C.line }} thumbColor={C.white} />
              </Row>
              {attach ? (
                <View style={{ borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: C.lineSoft, maxHeight: 260 }}>
                  <SketchSheet ref={sheetRef} items={items} diagramSvg={problem.diagramSvg} width={width - 38} />
                </View>
              ) : null}
            </View>
          ) : null}
          <Button title="Отправить вопрос" onPress={send} loading={sending} />
        </ScrollView>
      </View>
    </Modal>
  );
}

function FeedbackPanel({ feedback, onReveal, busy }: { feedback: Feedback; onReveal: () => void; busy: boolean }) {
  if (feedback.kind === "correct") {
    return (
      <Card style={{ backgroundColor: C.pineLight, borderColor: C.pineMint, gap: 8 }}>
        <Row>
          <Pop>
            <Mascot mood={feedback.selfChecked ? "happy" : "celebrating"} size={48} />
          </Pop>
          <View style={{ flex: 1 }}>
            <T w="black" size={17} color={C.pineDark}>
              {feedback.selfChecked ? "Решение сохранено" : "Верно!"}
            </T>
            <T size={13} color={C.pineDark}>
              {feedback.offline
                ? "Проверили без сети — разбор подтянется, когда появится интернет."
                : feedback.selfChecked
                  ? "Сравни своё решение с эталоном ниже."
                  : `Ответ: ${feedback.correctAnswer}`}
            </T>
          </View>
        </Row>
        {feedback.explanation ? (
          <View style={{ backgroundColor: C.white, borderRadius: 14, padding: 12 }}>
            <T w="extrabold" size={12} color={C.pineStrong} style={{ marginBottom: 4 }}>
              {feedback.selfChecked ? "ЭТАЛОННОЕ РЕШЕНИЕ" : "РАЗБОР"}
            </T>
            <T style={{ lineHeight: 22 }} selectable>
              {feedback.selfChecked ? feedback.correctAnswer : feedback.explanation}
            </T>
          </View>
        ) : null}
      </Card>
    );
  }
  if (feedback.kind === "wrong") {
    return (
      <Card style={{ backgroundColor: C.coralLight, borderColor: C.coralLight, gap: 8 }}>
        <Row>
          <Mascot mood="worried" size={40} />
          <T w="black" color={C.coralText} style={{ flex: 1 }}>
            Пока неверно{feedback.offline ? " · без сети" : ""}
          </T>
        </Row>
        {feedback.hint ? <T style={{ lineHeight: 22 }}>{feedback.hint}</T> : null}
        {feedback.canReveal ? <Button title="Показать решение" kind="secondary" small onPress={onReveal} loading={busy} /> : null}
      </Card>
    );
  }
  if (feedback.kind === "pending") {
    return (
      <Card style={{ backgroundColor: C.violetLight, borderColor: C.violetLight }}>
        <T w="extrabold" color={C.violetText}>
          Решение отправлено репетитору. Как только он проверит, придёт уведомление.
        </T>
      </Card>
    );
  }
  if (feedback.kind === "no_energy") {
    return (
      <Card style={{ backgroundColor: C.amberLight, borderColor: C.amberLight, gap: 4 }}>
        <T w="black" color={C.amberText}>
          Энергия закончилась
        </T>
        <T>
          {feedback.emailUnverified
            ? "Подтверди почту — тогда энергия будет восстанавливаться. А пока можно решать «Повторение»: оно без энергии."
            : "Она восстановится со временем. Пока можно решать «Повторение» — оно без энергии."}
        </T>
      </Card>
    );
  }
  return (
    <Card style={{ backgroundColor: C.coralLight, borderColor: C.coralLight }}>
      <T w="bold" color={C.coralText}>
        {feedback.message}
      </T>
    </Card>
  );
}
