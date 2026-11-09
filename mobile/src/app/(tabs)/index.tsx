import { Alert, Pressable, View } from "react-native";
import { router } from "expo-router";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useHome, useSelectedTopic, plural } from "@/lib/hooks";
import { errorText } from "@/lib/api";
import type { HomePayload, PathState } from "@/lib/types";
import { Button, Card, ErrorBox, H2, Loading, ProgressBar, Row, Screen, StatBadge, T } from "@/components/ui";
import { Icon, Mascot } from "@/components/Svg";
import { Bob, PressScale, PulseRing, Wiggle, enter } from "@/components/motion";
import Animated from "react-native-reanimated";
import { C, R, shadow } from "@/theme";

const OFFSETS = [0, 46, 70, 46, 0, -46, -70, -46];

export default function PathScreen() {
  const [topic, setTopic] = useSelectedTopic();
  const home = useHome(topic);
  const qc = useQueryClient();

  // Главная без выбора темы тоже кладётся в кэш — из него вкладки берут счётчики.
  useEffect(() => {
    if (home.data && topic) qc.setQueryData(["home", "auto"], home.data);
  }, [home.data, topic, qc]);

  if (home.isLoading && !home.data) return <Loading />;
  if (!home.data) return <Screen><ErrorBox message={errorText(home.error)} onRetry={() => home.refetch()} /></Screen>;
  const d = home.data;

  return (
    <Screen onRefresh={() => home.refetch()} refreshing={home.isRefetching}>
      <TopBar d={d} />
      <TodayCard d={d} />
      {d.activeMock ? (
        <Card onPress={() => router.push(`/mock/${d.activeMock!.id}`)} style={{ backgroundColor: C.pineDark, borderColor: C.pineDark }}>
          <Row>
            <Icon name="Clock" size={26} color={C.white} />
            <View style={{ flex: 1 }}>
              <T w="black" size={16} color={C.white}>
                Вариант {d.activeMock.variant} не закончен
              </T>
              <T size={13} color="rgba(255,255,255,0.8)">
                Ответов {d.activeMock.answered} из {d.activeMock.total} · продолжить
              </T>
            </View>
          </Row>
        </Card>
      ) : null}
      {d.counts.homework > 0 ? (
        <Card onPress={() => router.push("/homework")} style={{ backgroundColor: C.amberLight, borderColor: C.amberLight }}>
          <Row>
            <Icon name="Clipboard" size={24} color={C.amberText} />
            <T w="extrabold" color={C.amberText} style={{ flex: 1 }}>
              {d.counts.homework} {plural(d.counts.homework, ["задание ждёт", "задания ждут", "заданий ждут"])} от
              {d.user.teacherName ? ` ${d.user.teacherName}` : " репетитора"}
            </T>
            <T w="black" color={C.amberText}>
              →
            </T>
          </Row>
        </Card>
      ) : null}
      {d.topic ? (
        <>
          <Pressable
            onPress={() => router.push({ pathname: "/topics", params: { current: d.topic!.id } })}
            style={({ pressed }) => [
              { backgroundColor: C.white, borderRadius: R.card, padding: 14, borderWidth: 1, borderColor: C.lineSoft, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Row>
              <T size={30}>{d.topic.icon}</T>
              <View style={{ flex: 1, gap: 6 }}>
                <T w="black" size={17}>
                  {d.topic.title}
                </T>
                <TopicProgress d={d} />
              </View>
              <T w="extrabold" size={13} color={C.pineStrong}>
                Сменить
              </T>
            </Row>
          </Pressable>
          {d.topic.chapters.map((ch, ci) => (
            <Chapter key={ch.id} chapter={ch} index={ci} />
          ))}
        </>
      ) : null}
    </Screen>
  );
}

function TopBar({ d }: { d: HomePayload }) {
  const energy = d.stats.energy;
  return (
    <Row style={{ justifyContent: "space-between" }}>
      <Row gap={8} style={{ flex: 1 }}>
        <Bob amp={3}>
          <Mascot mood={d.stats.dailyGoal.done >= d.stats.dailyGoal.total ? "celebrating" : "happy"} size={42} />
        </Bob>
        <View style={{ flex: 1 }}>
          <T w="black" size={18} numberOfLines={1}>
            Привет, {d.user.name.split(" ")[0]}!
          </T>
          <T size={12} color={C.inkSoft}>
            {d.stats.level.title}
          </T>
        </View>
      </Row>
      <Row gap={6}>
        <Wiggle trigger={d.stats.streak}>
          <StatBadge icon="Flame" value={String(d.stats.streak)} color={C.amber} />
        </Wiggle>
        <StatBadge icon="Bolt" value={energy === null ? "∞" : String(energy)} color={energy === 0 ? C.coral : C.pine} />
        <Pressable onPress={() => router.push("/notifications")} hitSlop={8} accessibilityLabel="Уведомления">
          <Icon name="Bell" size={24} color={C.inkSoft} />
        </Pressable>
      </Row>
    </Row>
  );
}

function TodayCard({ d }: { d: HomePayload }) {
  const { done, total } = d.stats.dailyGoal;
  const pct = total ? (done / total) * 100 : 0;
  return (
    <Card style={{ gap: 10 }}>
      <Row style={{ justifyContent: "space-between" }}>
        <T w="black" size={16}>
          Цель на сегодня
        </T>
        <T w="extrabold" size={13} color={C.inkSoft}>
          до ЕГЭ {d.stats.examDaysLeft} {plural(d.stats.examDaysLeft, ["день", "дня", "дней"])}
        </T>
      </Row>
      <ProgressBar pct={pct} color={C.amber} track={C.amberLight} height={10} />
      <T size={13} color={C.inkSoft}>
        {done >= total
          ? "Цель дня выполнена — серия продолжается!"
          : `Решено ${done} из ${total} ${plural(total, ["задачи", "задач", "задач"])}. Ещё немного — и серия не оборвётся.`}
      </T>
      {d.counts.dueReview > 0 ? (
        <Button title={`Повторить ${d.counts.dueReview} ${plural(d.counts.dueReview, ["задачу", "задачи", "задач"])}`} kind="secondary" small onPress={() => router.push("/review")} />
      ) : null}
    </Card>
  );
}

function TopicProgress({ d }: { d: HomePayload }) {
  const t = d.topics.find((x) => x.id === d.topic?.id);
  if (!t) return null;
  return (
    <View style={{ gap: 4 }}>
      <ProgressBar pct={t.total ? (t.done / t.total) * 100 : 0} height={6} />
      <T size={12} color={C.inkSoft}>
        {t.done} из {t.total} {plural(t.total, ["урока", "уроков", "уроков"])}
      </T>
    </View>
  );
}

function Chapter({ chapter, index }: { chapter: NonNullable<HomePayload["topic"]>["chapters"][number]; index: number }) {
  const base = index < 2 ? index * 180 : 0;
  return (
    <View style={{ gap: 10, marginTop: 6 }}>
      <Animated.View entering={enter(0, base)} style={{ backgroundColor: C.pineLight, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 }}>
        <H2 style={{ color: C.pineDark, fontSize: 16 }}>{chapter.title}</H2>
      </Animated.View>
      <View style={{ alignItems: "center", gap: 14, paddingVertical: 4 }}>
        {chapter.skills.map((s, i) => (
          <Animated.View key={s.id} entering={enter(i + 1, base)}>
            <SkillNode skill={s} offset={OFFSETS[i % OFFSETS.length]} />
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

function SkillNode({
  skill,
  offset,
}: {
  skill: { id: string; title: string; state: PathState; solved: number; total: number; proOnly: boolean };
  offset: number;
}) {
  const current = skill.state === "current" && !skill.proOnly;
  const done = skill.state === "done";
  const locked = skill.state === "locked" || skill.proOnly;
  const size = current ? 78 : 64;
  const bg = done ? C.pine : current ? C.pineStrong : C.grid;
  function open() {
    if (skill.proOnly) {
      Alert.alert("Урок в Pro", "Этот урок открывается на тарифе Pro.");
      return;
    }
    if (skill.state === "locked") {
      Alert.alert("Пока закрыто", "Сначала пройди предыдущие уроки этой темы.");
      return;
    }
    router.push(`/skill/${skill.id}`);
  }
  return (
    <View style={{ transform: [{ translateX: offset }], alignItems: "center", width: 180 }}>
      {current ? (
        <Bob amp={5} duration={1100}>
          <View style={{ backgroundColor: C.white, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 6, borderWidth: 1, borderColor: C.line }}>
            <T w="black" size={12} color={C.pineStrong}>
              НАЧАТЬ
            </T>
          </View>
        </Bob>
      ) : null}
      <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        {current ? <PulseRing size={size} color={C.pine} /> : null}
        <PressScale
          onPress={open}
          scaleTo={0.9}
          accessibilityRole="button"
          accessibilityLabel={`${skill.title}${done ? ", пройден" : locked ? ", закрыт" : ""}`}
          style={[
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: bg,
              alignItems: "center",
              justifyContent: "center",
              borderBottomWidth: 5,
              borderBottomColor: done || current ? "rgba(0,0,0,0.18)" : C.line,
            },
            current ? { ...shadow, shadowOpacity: 0.18 } : null,
            current ? { borderWidth: 4, borderColor: C.pineMint } : null,
          ]}
        >
          <Icon name={done ? "Check" : skill.proOnly ? "Crown" : locked ? "Lock" : "Star"} size={current ? 34 : 28} color={locked ? "#9DB5A8" : C.white} />
        </PressScale>
      </View>
      <T w="bold" size={12} color={locked ? C.inkSoft : C.ink} numberOfLines={2} style={{ textAlign: "center", marginTop: 6 }}>
        {skill.title}
      </T>
      {skill.total > 0 && !locked && !done ? (
        <T size={11} color={C.inkSoft}>
          {skill.solved} из {skill.total}
        </T>
      ) : null}
    </View>
  );
}
