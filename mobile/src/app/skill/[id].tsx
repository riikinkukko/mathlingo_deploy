import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import Animated, { FadeInDown, FadeInRight, interpolateColor, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Bob, Confetti, Pop, enter, useCountUp } from "@/components/motion";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, errorText } from "@/lib/api";
import type { SkillPayload, TheoryCardM } from "@/lib/types";
import { Button, Card, ErrorBox, H1, H2, Loading, Row, Screen, T, Header } from "@/components/ui";
import { Diagram, Mascot } from "@/components/Svg";
import ProblemCard from "@/components/ProblemCard";
import { markProblemSolvedLocally, markSkillDoneLocally, prefetchNextSkill } from "@/lib/offline-progress";
import { C } from "@/theme";

type Phase = "theory" | "problems" | "done";

export default function LessonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["skill", id], queryFn: () => api<SkillPayload>(`/api/m/skill/${id}`) });

  if (q.isLoading && !q.data) return <Loading label="Открываем урок…" />;
  if (!q.data) return <Screen header={<Header title="Урок" />}><ErrorBox message={errorText(q.error)} onRetry={() => q.refetch()} /></Screen>;
  if (q.data.status === "upgrade") {
    return (
      <Screen header={<Header title="Урок в Pro" />}>
        <Card style={{ alignItems: "center", gap: 10, paddingVertical: 28 }}>
          <Mascot mood="hint" size={90} />
          <H2 style={{ textAlign: "center" }}>Этот урок — в Pro</H2>
          <T color={C.inkSoft} style={{ textAlign: "center" }}>
            На бесплатном тарифе открыта первая глава каждой темы и первый урок остальных глав. Pro открывает всю программу и пробники.
          </T>
          <Button title="К пути обучения" kind="secondary" onPress={() => router.back()} style={{ alignSelf: "stretch" }} />
        </Card>
      </Screen>
    );
  }
  if (q.data.status === "locked") {
    return (
      <Screen header={<Header title="Урок закрыт" />}>
        <Card style={{ alignItems: "center", gap: 10, paddingVertical: 28 }}>
          <Mascot mood="thinking" size={90} />
          <T w="bold" style={{ textAlign: "center" }}>
            Сначала пройди предыдущие уроки этой темы.
          </T>
        </Card>
      </Screen>
    );
  }
  return (
    <Lesson
      // Свой экземпляр на каждый урок: иначе при переходе «Дальше» состояние
      // (фаза «пройден», решённые задачи) переезжало в следующий урок.
      key={id}
      data={q.data}
      onSolved={(problemId) => markProblemSolvedLocally(qc, id, problemId)}
      onFinished={() => {
        // Без сети сервер не знает о прогрессе — отмечаем сами (offline-progress.ts);
        // при связи ответ сервера всё равно заменит эти отметки.
        markSkillDoneLocally(qc, id);
        qc.invalidateQueries({ queryKey: ["home"] });
        qc.invalidateQueries({ queryKey: ["skill", id] });
      }}
    />
  );
}

function Lesson({
  data,
  onFinished,
  onSolved,
}: {
  data: Extract<SkillPayload, { status: "ok" }>;
  onFinished: () => void;
  onSolved: (problemId: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  // Следующий урок — заранее, чтобы после этого его можно было пройти без сети.
  useEffect(() => {
    prefetchNextSkill(qc, data.next?.id);
  }, [qc, data.next?.id]);
  const firstUnsolved = data.problems.findIndex((p) => data.states[p.id]?.status !== "solved" && data.states[p.id]?.status !== "pending");
  const allSolved = data.problems.length > 0 && firstUnsolved === -1;
  const [phase, setPhase] = useState<Phase>(data.forceTheoryFirst && data.skill.theory.length ? "theory" : allSolved ? "done" : "problems");
  const [index, setIndex] = useState(Math.max(0, firstUnsolved));
  const [solved, setSolved] = useState<Set<string>>(
    () => new Set(data.problems.filter((p) => ["solved", "pending"].includes(data.states[p.id]?.status ?? "")).map((p) => p.id))
  );
  const problem = data.problems[index];
  const isSolved = problem ? solved.has(problem.id) : false;

  useEffect(() => {
    if (phase === "done") onFinished();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  if (phase === "theory") return <Theory cards={data.skill.theory} title={data.skill.title} onDone={() => setPhase(allSolved ? "done" : "problems")} />;
  if (phase === "done" || !problem) return <Done data={data} />;

  function next() {
    const rest = data.problems.findIndex((p, i) => i > index && !solved.has(p.id));
    const any = data.problems.findIndex((p) => !solved.has(p.id));
    if (rest >= 0) setIndex(rest);
    else if (any >= 0) setIndex(any);
    else setPhase("done");
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 14, paddingBottom: 10, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.lineSoft, gap: 10 }}>
        <Row>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Закрыть урок">
            <T w="black" size={22} color={C.inkSoft}>
              ✕
            </T>
          </Pressable>
          <T w="black" size={16} numberOfLines={1} style={{ flex: 1 }}>
            {data.skill.title}
          </T>
          {data.skill.theory.length ? (
            <Pressable onPress={() => setPhase("theory")} hitSlop={8}>
              <T w="extrabold" size={13} color={C.pineStrong}>
                Теория
              </T>
            </Pressable>
          ) : null}
        </Row>
        <Row gap={4}>
          {data.problems.map((p, i) => (
            <Pressable key={p.id} onPress={() => setIndex(i)} style={{ flex: 1, paddingVertical: 4 }} accessibilityLabel={`Задача ${i + 1}`}>
              <Segment state={solved.has(p.id) ? 2 : i === index ? 1 : 0} />
            </Pressable>
          ))}
        </Row>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 110 }} keyboardShouldPersistTaps="handled">
        <T w="bold" size={12} color={C.inkSoft} style={{ marginBottom: 8 }}>
          Задача {index + 1} из {data.problems.length}
        </T>
        <Animated.View key={problem.id} entering={FadeInRight.duration(280)}>
        <ProblemCard
          key={problem.id}
          problem={problem}
          state={data.states[problem.id]}
          source="lesson"
          canAskTeacher={data.canAskTeacher}
          onSolved={() => {
            setSolved((s) => new Set(s).add(problem.id));
            onSolved(problem.id);
          }}
        />
        </Animated.View>
      </ScrollView>
      {isSolved ? (
        <Animated.View entering={FadeInDown.springify().damping(16)} style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: insets.bottom + 16, backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.lineSoft }}>
          <Button title={solved.size === data.problems.length ? "Завершить урок" : "Дальше"} onPress={next} />
        </Animated.View>
      ) : null}
    </View>
  );
}

function Theory({ cards, title, onDone }: { cards: TheoryCardM[]; title: string; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const [i, setI] = useState(0);
  const card = cards[i];
  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <Header title="Теория" subtitle={title} onBack={onDone} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 110 }}>
        <T w="bold" size={12} color={C.inkSoft}>
          Карточка {i + 1} из {cards.length}
        </T>
        <Animated.View key={i} entering={FadeInRight.duration(260)}>
        <Card style={{ gap: 12 }}>
          <H2>{card.title}</H2>
          {card.formula ? (
            <View style={{ backgroundColor: C.pineLight, borderRadius: 14, padding: 12 }}>
              <T w="black" size={17} color={C.pineDark} style={{ textAlign: "center" }} selectable>
                {card.formula}
              </T>
            </View>
          ) : null}
          {card.diagramSvg ? <Diagram svg={card.diagramSvg} /> : null}
          <T style={{ lineHeight: 23 }} selectable>
            {card.body}
          </T>
        </Card>
        </Animated.View>
      </ScrollView>
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: insets.bottom + 16, flexDirection: "row", gap: 10, backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.lineSoft }}>
        <Button title="Назад" kind="secondary" disabled={i === 0} onPress={() => setI(i - 1)} style={{ flex: 1 }} />
        <Button title={i === cards.length - 1 ? "К задачам" : "Дальше"} onPress={() => (i === cards.length - 1 ? onDone() : setI(i + 1))} style={{ flex: 1.4 }} />
      </View>
    </View>
  );
}

function Done({ data }: { data: Extract<SkillPayload, { status: "ok" }> }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const xp = useMemo(() => data.problems.length * 10, [data.problems.length]);
  const shown = useCountUp(xp, 900, 450);
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => {
      setBurst(1);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: insets.top + 40, gap: 16, alignItems: "center", backgroundColor: C.paper, flexGrow: 1 }}>
      <Pop>
        <Bob amp={6}>
          <Mascot mood="celebrating" size={140} />
        </Bob>
      </Pop>
      <Animated.View entering={enter(1, 150)}>
        <H1 style={{ textAlign: "center" }}>Урок пройден!</H1>
      </Animated.View>
      <Animated.View entering={enter(2, 150)} style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ backgroundColor: C.amberLight, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 10, alignItems: "center" }}>
          <T w="black" size={26} color={C.amberText}>+{shown}</T>
          <T w="bold" size={12} color={C.amberText}>опыта</T>
        </View>
        <View style={{ backgroundColor: C.pineLight, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 10, alignItems: "center" }}>
          <T w="black" size={26} color={C.pineDark}>{data.problems.length}</T>
          <T w="bold" size={12} color={C.pineDark}>задач решено</T>
        </View>
      </Animated.View>
      <T color={C.inkSoft} style={{ textAlign: "center" }}>
        «{data.skill.title}» — все задачи решены.
      </T>
      {data.detailedPreview ? (
        <Card style={{ gap: 8, alignSelf: "stretch" }}>
          <T w="black" color={C.amberText}>
            Так выглядит задача второй части{data.detailedPreview.egeTaskNumber ? ` (№${data.detailedPreview.egeTaskNumber})` : ""}
          </T>
          <T>{data.detailedPreview.text}</T>
          <T w="extrabold" size={12} color={C.pineStrong}>
            ЭТАЛОННОЕ РЕШЕНИЕ
          </T>
          <T size={14}>{data.detailedPreview.solution}</T>
          <T size={13} color={C.inkSoft}>
            Решать такие задачи с проверкой можно в Pro.
          </T>
        </Card>
      ) : null}
      <Animated.View entering={enter(4, 300)} style={{ alignSelf: "stretch", gap: 10, marginTop: 8 }}>
        {data.next ? <Button title={`Дальше: ${data.next.title}`} onPress={() => router.replace(`/skill/${data.next!.id}`)} /> : null}
        <Button title="К пути обучения" kind="secondary" onPress={() => router.back()} />
      </Animated.View>
    </ScrollView>
      <Confetti burst={burst} x={width / 2} y={insets.top + 120} count={40} />
    </View>
  );
}

/** Сегмент прогресса урока: плавно заливается при решении задачи. */
function Segment({ state }: { state: 0 | 1 | 2 }) {
  const v = useSharedValue(state);
  const sy = useSharedValue(1);
  useEffect(() => {
    v.value = withTiming(state, { duration: 380 });
    if (state === 2) {
      sy.value = 1.8;
      sy.value = withSpring(1, { damping: 7 });
    }
  }, [state, v, sy]);
  const a = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(v.value, [0, 1, 2], [C.grid, C.pineMint, C.pine]),
    transform: [{ scaleY: sy.value }],
  }));
  return <Animated.View style={[{ height: 8, borderRadius: 4 }, a]} />;
}
