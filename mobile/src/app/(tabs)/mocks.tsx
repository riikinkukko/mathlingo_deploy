import { useState } from "react";
import { Alert, Modal, Pressable, View } from "react-native";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorText } from "@/lib/api";
import type { MockListPayload } from "@/lib/types";
import { Button, Card, ErrorBox, H1, H2, Loading, Row, Screen, T } from "@/components/ui";
import { Icon } from "@/components/Svg";
import { dateLabel, formatDuration } from "@/lib/mock-format";
import { plural } from "@/lib/hooks";
import { C, R } from "@/theme";

export default function MocksScreen() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["mocks"], queryFn: () => api<MockListPayload>("/api/m/mocks") });
  const [picked, setPicked] = useState<number | null>(null);
  const [mode, setMode] = useState<"full" | "part1" | "free">("full");
  const [starting, setStarting] = useState(false);

  if (q.isLoading && !q.data) return <Loading />;
  if (!q.data) return <Screen><ErrorBox message={errorText(q.error)} onRetry={() => q.refetch()} /></Screen>;
  const d = q.data;
  const full = d.history.filter((h) => h.mode !== "part1").slice().reverse();

  async function start() {
    if (picked == null) return;
    setStarting(true);
    try {
      const r = await api<{ id: string; resumed: boolean }>("/api/m/mocks", { body: { variant: picked, mode } });
      setPicked(null);
      qc.invalidateQueries({ queryKey: ["mocks"] });
      router.push(`/mock/${r.id}`);
    } catch (e) {
      Alert.alert("Не получилось начать", errorText(e));
    } finally {
      setStarting(false);
    }
  }

  return (
    <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <H1>Пробники ЕГЭ</H1>
      <T color={C.inkSoft}>
        20 заданий в формате ЕГЭ-2027: бланк ответов, таймер на 3 ч 55 мин и баллы по 100-балльной шкале. Всё сохраняется само.
      </T>
      {d.active ? (
        <Card onPress={() => router.push(`/mock/${d.active!.id}`)} style={{ backgroundColor: C.pineDark, borderColor: C.pineDark, gap: 4 }}>
          <T w="black" size={17} color={C.white}>
            Вариант {d.active.variant} — не закончен
          </T>
          <T size={13} color="rgba(255,255,255,0.8)">
            Ответов {d.active.answered} из {d.active.total}
            {d.active.deadlineAt
              ? new Date(d.active.deadlineAt).getTime() > Date.now()
                ? ` · осталось ${formatDuration((new Date(d.active.deadlineAt).getTime() - Date.now()) / 1000)}`
                : " · время вышло, осталось сдать"
              : ""}
          </T>
          <T w="extrabold" color={C.pineMint} style={{ marginTop: 4 }}>
            Продолжить →
          </T>
        </Card>
      ) : null}

      {full.length ? (
        <Card style={{ gap: 10 }}>
          <Row style={{ justifyContent: "space-between" }}>
            <H2>Твои баллы</H2>
            {d.targetScore ? (
              <T w="bold" size={12} color={C.inkSoft}>
                цель {d.targetScore}
              </T>
            ) : null}
          </Row>
          <ScoreBars scores={full.map((h) => ({ score: h.testScore, label: dateLabel(h.finishedAt) }))} target={d.targetScore} />
        </Card>
      ) : null}

      <Row style={{ justifyContent: "space-between", marginTop: 4 }}>
        <H2>Варианты</H2>
        {!d.allVariants ? (
          <T w="extrabold" size={13} color={C.amberText}>
            Все 20 — в Pro
          </T>
        ) : null}
      </Row>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {d.variants.map((v) => (
          <Pressable
            key={v.variant}
            onPress={() => (v.locked ? Alert.alert("Вариант в Pro", "Первый вариант бесплатный, все 20 открываются на тарифе Pro.") : setPicked(v.variant))}
            style={{
              width: "23%",
              aspectRatio: 1,
              borderRadius: 16,
              borderWidth: v.locked ? 1.5 : 1,
              borderStyle: v.locked ? "dashed" : "solid",
              borderColor: v.best != null ? C.pineMint : C.line,
              backgroundColor: v.locked ? "transparent" : v.best != null ? C.pineLight : C.white,
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
            }}
          >
            <T w="black" size={22} color={v.locked ? C.inkSoft : C.ink}>
              {v.variant}
            </T>
            {v.locked ? (
              <Icon name="Lock" size={14} color={C.inkSoft} />
            ) : (
              <T w="bold" size={11} color={v.best != null ? C.pineDark : C.inkSoft}>
                {v.best != null ? `${v.best} б.` : v.tries ? "начат" : "вариант"}
              </T>
            )}
          </Pressable>
        ))}
      </View>
      {d.scaleIsEstimate ? (
        <T size={12} color={C.inkSoft}>
          Тестовый балл ориентировочный: официальную шкалу ЕГЭ-2027 опубликуют ближе к экзамену.
        </T>
      ) : null}

      {d.history.length ? (
        <>
          <H2 style={{ marginTop: 6 }}>История</H2>
          {d.history.map((h) => (
            <Card key={h.id} onPress={() => router.push(`/mock/${h.id}`)}>
              <Row>
                <View style={{ flex: 1 }}>
                  <T w="black">Вариант {h.variant}</T>
                  <T size={12} color={C.inkSoft}>
                    {dateLabel(h.finishedAt)}
                    {h.mode === "part1" ? " · только 1 часть" : ""}
                    {h.part2Pending ? " · 2 часть на проверке" : ""}
                  </T>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <T w="black" size={22}>
                    {h.testScore}
                  </T>
                  <T size={11} color={C.inkSoft}>
                    {plural(h.testScore, ["балл", "балла", "баллов"])}
                  </T>
                </View>
              </Row>
            </Card>
          ))}
        </>
      ) : null}

      <Modal visible={picked != null} transparent animationType="slide" onRequestClose={() => setPicked(null)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(19,42,32,0.45)" }} onPress={() => setPicked(null)} />
        <View style={{ backgroundColor: C.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, gap: 12 }}>
          <H2>Вариант {picked}</H2>
          <T size={13} color={C.inkSoft}>
            Ответы не проверяются до сдачи — как на экзамене. Можно закрыть приложение и продолжить позже.
          </T>
          {d.modes.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => setMode(m.id)}
              style={{ borderWidth: 2, borderColor: mode === m.id ? C.pine : C.lineSoft, backgroundColor: mode === m.id ? C.pineLight : C.white, borderRadius: R.input, padding: 14, gap: 2 }}
            >
              <T w="black">{m.title}</T>
              <T size={13} color={C.inkSoft}>
                {m.hint}
              </T>
            </Pressable>
          ))}
          <Button title="Начать" onPress={start} loading={starting} />
          <View style={{ height: 8 }} />
        </View>
      </Modal>
    </Screen>
  );
}

/** Столбики баллов по пробникам с линией цели. */
function ScoreBars({ scores, target }: { scores: { score: number; label: string }[]; target: number | null }) {
  const last = scores.slice(-8);
  return (
    <View style={{ height: 150, flexDirection: "row", alignItems: "flex-end", gap: 8, paddingTop: 16 }}>
      {target ? <View style={{ position: "absolute", left: 0, right: 0, bottom: 22 + (target / 100) * 110, borderTopWidth: 1.5, borderStyle: "dashed", borderColor: C.inkSoft }} /> : null}
      {last.map((s, i) => (
        <View key={i} style={{ flex: 1, alignItems: "center", gap: 4 }}>
          <T w="black" size={12}>
            {s.score}
          </T>
          <View style={{ width: "70%", height: Math.max(6, (s.score / 100) * 110), backgroundColor: i === last.length - 1 ? C.pine : C.pineMint, borderRadius: 6 }} />
          <T size={10} color={C.inkSoft} numberOfLines={1}>
            {s.label}
          </T>
        </View>
      ))}
    </View>
  );
}
