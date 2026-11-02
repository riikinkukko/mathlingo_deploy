import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AppState, Image, Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { api, errorText } from "@/lib/api";
import type { MockResultPayload, MockRunnerPayload } from "@/lib/types";
import { Button, Card, ErrorBox, H1, H2, Header, Loading, Pill, Row, Screen, T } from "@/components/ui";
import { Diagram, Icon, Mascot } from "@/components/Svg";
import { blankAnswerProblem, formatDuration, humanDuration, isPart1 } from "@/lib/mock-format";
import { pickSolutionPhoto } from "@/lib/image";
import { plural } from "@/lib/hooks";
import { C, F, R } from "@/theme";

type Payload = MockRunnerPayload | MockResultPayload;

export default function MockScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ["mock", id], queryFn: () => api<Payload>(`/api/m/mocks/${id}`), staleTime: 0 });
  if (q.isLoading && !q.data) return <Loading label="Открываем вариант…" />;
  if (!q.data) return <Screen header={<Header title="Пробник" />}><ErrorBox message={errorText(q.error)} onRetry={() => q.refetch()} /></Screen>;
  return q.data.status === "running" ? <Runner data={q.data} onFinished={() => q.refetch()} /> : <Results data={q.data} onChanged={() => q.refetch()} />;
}

// ---------------- Решение варианта ----------------

function Runner({ data, onFinished }: { data: MockRunnerPayload; onFinished: () => void }) {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const items = data.items;
  const [index, setIndex] = useState(() => Math.max(0, items.findIndex((it) => !data.answers[it.problem.id] && !data.photos.includes(it.problem.id))));
  const [answers, setAnswers] = useState<Record<string, string>>(data.answers);
  const [flags, setFlags] = useState<string[]>(data.flags);
  const [photos, setPhotos] = useState<Record<string, string | true>>(() => Object.fromEntries(data.photos.map((p) => [p, true])));
  const [sheet, setSheet] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [now, setNow] = useState(Date.now());
  const deadline = data.deadlineAt ? new Date(data.deadlineAt).getTime() : null;
  const remaining = deadline ? Math.round((deadline - now) / 1000) : null;
  const expired = remaining !== null && remaining <= 0;
  const item = items[index];
  const pid = item?.problem.id;

  // Время на каждое задание (только пока приложение на экране).
  const time = useRef<Record<string, number>>({ ...data.timeSpent });
  const since = useRef<number>(Date.now());
  const flushTime = useCallback(() => {
    if (!pid) return;
    const t = Date.now();
    time.current[pid] = (time.current[pid] ?? 0) + (t - since.current) / 1000;
    since.current = t;
  }, [pid]);

  const latest = useRef({ answers, flags });
  latest.current = { answers, flags };
  const save = useCallback(async () => {
    flushTime();
    setSaveState("saving");
    try {
      const timeSpent = Object.fromEntries(Object.entries(time.current).map(([k, v]) => [k, Math.round(v)]));
      await api(`/api/m/mocks/${data.id}`, { method: "PATCH", body: { ...latest.current, timeSpent } });
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }, [data.id, flushTime]);

  useEffect(() => {
    flushTime();
    since.current = Date.now();
  }, [index, flushTime]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    const s = setInterval(() => void save(), 20_000);
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "active") since.current = Date.now();
      else void save();
    });
    return () => {
      clearInterval(t);
      clearInterval(s);
      sub.remove();
    };
  }, [save]);

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  function setAnswer(value: string) {
    if (!pid || expired) return;
    setAnswers((a) => {
      const n = { ...a };
      if (value) n[pid] = value;
      else delete n[pid];
      return n;
    });
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void save(), 900);
  }

  useEffect(() => {
    if (expired) {
      void save();
      setFinishOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired]);

  async function photo(problemId: string, fromCamera: boolean) {
    const res = await pickSolutionPhoto(fromCamera).catch(() => null);
    if (res === "denied") return Alert.alert("Нет доступа к камере", "Разреши доступ в настройках или выбери фото из галереи.");
    if (!res) return;
    try {
      await api(`/api/m/mocks/${data.id}/photo`, { body: { problemId, image: res } });
      setPhotos((p) => ({ ...p, [problemId]: res }));
    } catch (e) {
      Alert.alert("Фото не сохранилось", errorText(e));
    }
  }

  async function finish() {
    setFinishing(true);
    flushTime();
    try {
      const timeSpent = Object.fromEntries(Object.entries(time.current).map(([k, v]) => [k, Math.round(v)]));
      await api(`/api/m/mocks/${data.id}/finish`, { body: expired ? {} : { answers, flags, timeSpent } });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      qc.invalidateQueries({ queryKey: ["mocks"] });
      qc.invalidateQueries({ queryKey: ["home"] });
      setFinishOpen(false);
      onFinished();
    } catch (e) {
      Alert.alert("Не удалось сдать", `${errorText(e)} Ответы сохранены — попробуй ещё раз.`);
    } finally {
      setFinishing(false);
    }
  }

  const part1 = items.filter((it) => isPart1(it.n));
  const part2 = items.filter((it) => !isPart1(it.n));
  const answered1 = part1.filter((it) => answers[it.problem.id]).length;
  const done2 = part2.filter((it) => photos[it.problem.id] || answers[it.problem.id]).length;
  const value = pid ? answers[pid] ?? "" : "";
  const formatIssue = item && isPart1(item.n) ? blankAnswerProblem(value) : null;
  const flagged = pid ? flags.includes(pid) : false;

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 12, paddingBottom: 10, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.lineSoft }}>
        <Row>
          <Pressable
            onPress={() => {
              void save();
              router.back();
            }}
            hitSlop={10}
            accessibilityLabel="Выйти — ответы сохранятся"
            style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}
          >
            <T w="black" size={18} color={C.inkSoft}>
              ←
            </T>
          </Pressable>
          <View style={{ flex: 1 }}>
            <T w="black" size={16}>
              Вариант {data.variant}
            </T>
            <T w="bold" size={12} color={saveState === "error" ? C.coralText : C.pineStrong}>
              {saveState === "saved" ? "сохранено" : saveState === "saving" ? "сохраняем…" : "нет связи, повторим"}
            </T>
          </View>
          <View style={{ backgroundColor: remaining !== null && remaining <= 300 ? C.coral : remaining !== null && remaining <= 1800 ? C.amberLight : C.pineLight, borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
            <T w="black" size={15} color={remaining !== null && remaining <= 300 ? C.white : C.pineDark} style={{ fontVariant: ["tabular-nums"] }}>
              {remaining !== null ? formatDuration(remaining) : formatDuration((now - new Date(data.startedAt).getTime()) / 1000)}
            </T>
          </View>
          <Button title="Сдать" small onPress={() => setFinishOpen(true)} />
        </Row>
      </View>

      {item ? (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 100 }} keyboardShouldPersistTaps="handled">
          <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <View>
              <T w="black" size={34} style={{ lineHeight: 38 }}>
                {item.n}
                <T w="bold" size={13} color={C.inkSoft}>
                  {"  "}из {items.length}
                </T>
              </T>
              <T w="bold" size={12} color={C.inkSoft}>
                {isPart1(item.n) ? "Часть 1 · краткий ответ · 1 балл" : `Часть 2 · развёрнутое решение · до ${item.maxPoints} ${item.maxPoints === 1 ? "балла" : "баллов"}`}
              </T>
            </View>
            <Pressable
              onPress={() => {
                if (!pid) return;
                setFlags((f) => (f.includes(pid) ? f.filter((x) => x !== pid) : [...f, pid]));
                void save();
              }}
              style={{ borderWidth: 2, borderColor: flagged ? C.amber : C.line, backgroundColor: flagged ? C.amberLight : C.white, borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 6 }}
            >
              <T w="extrabold" size={12} color={flagged ? C.amberText : C.inkSoft}>
                {flagged ? "🔖 Вернусь" : "Вернуться позже"}
              </T>
            </Pressable>
          </Row>
          {item.problem.diagramSvg ? <Diagram svg={item.problem.diagramSvg} /> : null}
          <T w="semibold" size={17} style={{ lineHeight: 25 }} selectable>
            {item.problem.text}
          </T>
          {isPart1(item.n) ? (
            <View style={{ gap: 8 }}>
              <T w="extrabold" size={12} color={C.inkSoft}>
                ОТВЕТ В БЛАНК
              </T>
              <Row gap={8}>
                <TextInput
                  value={value}
                  onChangeText={setAnswer}
                  editable={!expired}
                  placeholder="Число"
                  placeholderTextColor="#9DB5A8"
                  keyboardType="numbers-and-punctuation"
                  returnKeyType="next"
                  onSubmitEditing={() => setIndex(Math.min(items.length - 1, index + 1))}
                  style={{ flex: 1, minWidth: 0, borderWidth: 2, borderColor: formatIssue ? C.coral : C.line, borderRadius: R.input, paddingHorizontal: 14, paddingVertical: 10, fontFamily: F.black, fontSize: 22, color: C.ink, backgroundColor: C.white }}
                />
                <KeyBtn label="±" onPress={() => setAnswer(value.startsWith("-") ? value.slice(1) : `-${value}`)} />
                <KeyBtn label="," onPress={() => !value.includes(",") && setAnswer(`${value || "0"},`)} />
              </Row>
              {formatIssue ? (
                <T w="bold" size={13} color={C.coralText}>
                  {formatIssue}
                </T>
              ) : value ? (
                <Row gap={6}>
                  <T w="bold" size={12} color={C.inkSoft}>
                    В бланке:
                  </T>
                  <View style={{ flexDirection: "row" }}>
                    {value.split("").map((ch, i) => (
                      <View key={i} style={{ width: 24, height: 32, borderWidth: 1, borderColor: "rgba(19,42,32,0.3)", marginLeft: i ? -1 : 0, alignItems: "center", justifyContent: "center", backgroundColor: C.white }}>
                        <T w="bold" size={15}>
                          {ch}
                        </T>
                      </View>
                    ))}
                  </View>
                </Row>
              ) : (
                <T size={12} color={C.inkSoft}>
                  Целое число или десятичная дробь.
                </T>
              )}
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              <T size={13} color={C.inkSoft} style={{ backgroundColor: C.white, padding: 12, borderRadius: 14 }}>
                Реши на бумаге, как на экзамене. Фото можно приложить сейчас или в конце — перед сдачей напомним.
                {data.hasTeacher ? " Решение проверит репетитор по критериям ФИПИ." : " После сдачи сравнишь решение с эталоном."}
              </T>
              {photos[item.problem.id] ? (
                <View style={{ borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: C.line, backgroundColor: C.white }}>
                  {typeof photos[item.problem.id] === "string" ? (
                    <Image source={{ uri: photos[item.problem.id] as string }} style={{ width: "100%", height: 220 }} resizeMode="contain" />
                  ) : (
                    <T w="bold" color={C.pineStrong} style={{ padding: 14 }}>
                      📷 Фото приложено
                    </T>
                  )}
                  <View style={{ padding: 8 }}>
                    <Button title="Переснять" kind="secondary" small onPress={() => photo(item.problem.id, true)} />
                  </View>
                </View>
              ) : (
                <Row>
                  <Button title="Камера" kind="secondary" style={{ flex: 1 }} onPress={() => photo(item.problem.id, true)} />
                  <Button title="Галерея" kind="secondary" style={{ flex: 1 }} onPress={() => photo(item.problem.id, false)} />
                </Row>
              )}
            </View>
          )}
        </ScrollView>
      ) : null}

      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: 8, padding: 12, paddingBottom: insets.bottom + 12, backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.lineSoft }}>
        <KeyBtn label="←" onPress={() => setIndex(Math.max(0, index - 1))} big />
        <Pressable onPress={() => setSheet(true)} style={{ flex: 1, height: 50, borderRadius: 16, backgroundColor: C.paper, alignItems: "center", justifyContent: "center" }}>
          <T w="black">
            Бланк · {answered1 + done2} из {items.length}
            {flags.length ? `  🔖${flags.length}` : ""}
          </T>
        </Pressable>
        <KeyBtn label="→" onPress={() => (index < items.length - 1 ? setIndex(index + 1) : setFinishOpen(true))} big />
      </View>

      <Modal visible={sheet} transparent animationType="slide" onRequestClose={() => setSheet(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(19,42,32,0.4)" }} onPress={() => setSheet(false)} />
        <View style={{ backgroundColor: C.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 16, paddingBottom: insets.bottom + 16, maxHeight: "85%" }}>
          <ScrollView contentContainerStyle={{ gap: 10 }}>
            <H2>Бланк ответов №1</H2>
            <Cells items={part1} answers={answers} flags={flags} current={index} all={items} onPick={(i) => { setIndex(i); setSheet(false); }} />
            {part2.length ? (
              <>
                <H2 style={{ marginTop: 6 }}>Часть 2</H2>
                <Cells items={part2} answers={answers} flags={flags} current={index} all={items} photos={photos} onPick={(i) => { setIndex(i); setSheet(false); }} />
              </>
            ) : null}
            <Button title="Закрыть" kind="secondary" onPress={() => setSheet(false)} />
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={finishOpen} transparent animationType="slide" onRequestClose={() => { if (!expired) setFinishOpen(false); }}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(19,42,32,0.5)" }} onPress={() => !expired && setFinishOpen(false)} />
        <View style={{ backgroundColor: C.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 18, paddingBottom: insets.bottom + 16, maxHeight: "90%" }}>
          <ScrollView contentContainerStyle={{ gap: 12 }}>
            <H2>{expired ? "Время вышло" : "Сдать работу?"}</H2>
            <T size={14} color={C.inkSoft}>
              {expired
                ? part2.length
                  ? "Ответы первой части сохранены. Сфотографируй решения второй части — на это есть 30 минут — и сдай работу."
                  : "Все сохранённые ответы уйдут на проверку."
                : "После сдачи ответы уже не поменять — сразу покажем баллы и разбор."}
            </T>
            <Row>
              <Card style={{ flex: 1, alignItems: "center", backgroundColor: C.paper }}>
                <T w="bold" size={12} color={C.inkSoft}>
                  Часть 1
                </T>
                <T w="black" size={20}>
                  {answered1} из {part1.length}
                </T>
              </Card>
              {part2.length ? (
                <Card style={{ flex: 1, alignItems: "center", backgroundColor: C.paper }}>
                  <T w="bold" size={12} color={C.inkSoft}>
                    Часть 2, с фото
                  </T>
                  <T w="black" size={20}>
                    {done2} из {part2.length}
                  </T>
                </Card>
              ) : null}
            </Row>
            {!expired && part1.some((it) => !answers[it.problem.id]) ? (
              <View style={{ gap: 6 }}>
                <T w="extrabold" size={13}>
                  Без ответа
                </T>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {part1
                    .filter((it) => !answers[it.problem.id])
                    .map((it) => (
                      <Pressable key={it.problem.id} onPress={() => { setFinishOpen(false); setIndex(items.indexOf(it)); }} style={{ width: 40, height: 40, borderRadius: 12, borderWidth: 2, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
                        <T w="black">{it.n}</T>
                      </Pressable>
                    ))}
                </View>
              </View>
            ) : null}
            {part2.length ? (
              <View style={{ gap: 8 }}>
                <T w="extrabold" size={13}>
                  Фото решений второй части
                </T>
                {part2.map((it) => (
                  <Row key={it.problem.id} style={{ borderWidth: 1, borderColor: C.lineSoft, borderRadius: 14, padding: 8 }}>
                    <T w="black" size={16} style={{ width: 32, textAlign: "center" }}>
                      {it.n}
                    </T>
                    <T size={13} color={photos[it.problem.id] ? C.pineStrong : C.inkSoft} style={{ flex: 1 }}>
                      {photos[it.problem.id] ? "Фото приложено" : "Фото нет"}
                    </T>
                    <Button title={photos[it.problem.id] ? "Переснять" : "Снять"} kind="secondary" small onPress={() => photo(it.problem.id, true)} />
                  </Row>
                ))}
                <T size={12} color={C.inkSoft}>
                  Не решал задание — просто оставь без фото.
                </T>
              </View>
            ) : null}
            <Row>
              {!expired ? <Button title="Вернуться" kind="secondary" style={{ flex: 1 }} onPress={() => setFinishOpen(false)} /> : null}
              <Button title="Сдать работу" style={{ flex: 1.3 }} onPress={finish} loading={finishing} />
            </Row>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function KeyBtn({ label, onPress, big }: { label: string; onPress: () => void; big?: boolean }) {
  return (
    <Pressable onPress={onPress} style={{ width: big ? 50 : 48, height: big ? 50 : 48, borderRadius: 14, borderWidth: 2, borderColor: C.line, backgroundColor: C.white, alignItems: "center", justifyContent: "center" }}>
      <T w="black" size={20} color={C.inkSoft}>
        {label}
      </T>
    </Pressable>
  );
}

function Cells({
  items,
  all,
  answers,
  flags,
  photos,
  current,
  onPick,
}: {
  items: MockRunnerPayload["items"];
  all: MockRunnerPayload["items"];
  answers: Record<string, string>;
  flags: string[];
  photos?: Record<string, string | true>;
  current: number;
  onPick: (i: number) => void;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {items.map((it) => {
        const i = all.indexOf(it);
        const filled = !!answers[it.problem.id] || !!photos?.[it.problem.id];
        return (
          <Pressable
            key={it.problem.id}
            onPress={() => onPick(i)}
            style={{
              width: "48%",
              height: 46,
              borderRadius: 12,
              borderWidth: 2,
              borderColor: i === current ? C.pine : filled ? "transparent" : C.lineSoft,
              backgroundColor: filled ? C.pineLight : C.white,
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 10,
              gap: 8,
            }}
          >
            <T w="black" size={13} color={C.inkSoft} style={{ width: 22 }}>
              {it.n}
            </T>
            <T w="bold" size={15} numberOfLines={1} style={{ flex: 1 }}>
              {photos ? (photos[it.problem.id] ? "📷 фото" : answers[it.problem.id] ? "текст" : "") : answers[it.problem.id] ?? ""}
            </T>
            {flags.includes(it.problem.id) ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.amber }} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------- Разбор ----------------

function Results({ data, onChanged }: { data: MockResultPayload; onChanged: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const correct1 = data.part1.filter((p) => p.correct).length;
  const part2Known = data.part2.reduce((s, x) => s + (x.score ?? 0), 0);
  const part2Max = data.part2.reduce((s, x) => s + x.max, 0);
  const unscored = data.part2.filter((x) => x.status === "unscored").length;
  const delta = data.previousScore != null && data.part2Pending === 0 ? data.testScore - data.previousScore : null;
  const wrong = data.part1.filter((p) => !p.correct);

  return (
    <Screen header={<Header title={`Вариант ${data.variant} — разбор`} subtitle={data.modeTitle} />} onRefresh={onChanged}>
      <View style={{ backgroundColor: C.pineDark, borderRadius: 24, padding: 20, gap: 12 }}>
        <Row style={{ alignItems: "flex-end" }}>
          <T w="black" size={64} color={C.white} style={{ lineHeight: 68 }}>
            {data.testScore}
          </T>
          <T w="bold" size={13} color="rgba(255,255,255,0.75)" style={{ marginBottom: 10, flex: 1 }}>
            {data.mode === "part1" ? "тестовых баллов за 1 часть" : `тестовых ${plural(data.testScore, ["балл", "балла", "баллов"])}`}
            {data.scaleIsEstimate ? " · ориентировочно" : ""}
          </T>
        </Row>
        <Row gap={18} style={{ flexWrap: "wrap" }}>
          <Stat label="Первичные" value={`${data.primaryScore} из ${data.maxPrimary}`} />
          <Stat label="Часть 1" value={`${correct1} из ${data.part1.length}`} />
          {data.part2.length ? <Stat label="Часть 2" value={`${part2Known} из ${part2Max}${data.part2Pending ? " +" : ""}`} /> : null}
          {data.totalTime > 0 ? <Stat label="Время" value={humanDuration(data.totalTime)} /> : null}
        </Row>
        <Row gap={8} style={{ flexWrap: "wrap" }}>
          {delta !== null ? <Pill text={`${delta > 0 ? "+" : ""}${delta} к прошлому пробнику`} bg="rgba(255,255,255,0.15)" color={C.white} /> : null}
          {data.targetScore && data.mode !== "part1" ? (
            <Pill
              text={data.testScore >= data.targetScore ? `Цель ${data.targetScore} достигнута` : `До цели ${data.targetScore} — ${data.targetScore - data.testScore}`}
              bg="rgba(255,255,255,0.15)"
              color={C.white}
            />
          ) : null}
          {data.testScore > 0 && data.testScore < data.passScore ? <Pill text={`Ниже порога ${data.passScore}`} bg={C.coral} color={C.white} /> : null}
        </Row>
      </View>

      {data.part2Pending ? (
        <Card style={{ backgroundColor: C.violetLight, borderColor: C.violetLight }}>
          <T w="bold" color={C.violetText}>
            {data.part2Pending} {plural(data.part2Pending, ["решение", "решения", "решений"])} второй части у репетитора на проверке. Итог обновится сам — пришлём уведомление.
          </T>
        </Card>
      ) : null}
      {unscored && !data.hasTeacher ? (
        <Card style={{ backgroundColor: C.amberLight, borderColor: C.amberLight }}>
          <T w="bold" color={C.amberText}>
            Оцени вторую часть по критериям — пока итог посчитан без {unscored === 1 ? "одного задания" : `${unscored} заданий`}.
          </T>
        </Card>
      ) : null}

      {wrong.length ? (
        <Card style={{ gap: 6 }}>
          <H2>Что подтянуть</H2>
          <T size={14} color={C.inkSoft}>
            В первой части не засчитаны: {wrong.map((w) => `№${w.n}`).join(", ")}. Эти задачи уже в «Моих ошибках».
          </T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
            {[...new Map(wrong.filter((w) => w.skillId).map((w) => [w.skillId!, w.skillTitle ?? "Навык"])).entries()].slice(0, 6).map(([sid, title]) => (
              <Pressable key={sid} onPress={() => router.push(`/skill/${sid}`)} style={{ borderWidth: 2, borderColor: C.line, borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
                <T w="bold" size={13}>
                  {title}
                </T>
              </Pressable>
            ))}
          </View>
        </Card>
      ) : null}

      <H2>Часть 1</H2>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <View style={{ flexDirection: "row", paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4, gap: 10 }}>
          <View style={{ width: 30 }} />
          <T w="bold" size={11} color={C.inkSoft} style={{ flex: 1 }}>
            Твой ответ
          </T>
          <T w="bold" size={11} color={C.inkSoft} style={{ flex: 1 }}>
            Верный
          </T>
          <T w="bold" size={11} color={C.inkSoft}>
            Время
          </T>
        </View>
        {data.part1.map((p, i) => {
          const isOpen = open === p.problemId;
          return (
            <View key={p.problemId} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: C.lineSoft }}>
              <Pressable onPress={() => setOpen(isOpen ? null : p.problemId)} style={{ flexDirection: "row", alignItems: "center", padding: 12, gap: 10 }}>
                <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: p.correct ? C.pineLight : C.coralLight, alignItems: "center", justifyContent: "center" }}>
                  <T w="black" size={13} color={p.correct ? C.pineDark : C.coral}>
                    {p.n}
                  </T>
                </View>
                <T w="bold" size={15} color={p.answer ? (p.correct ? C.ink : C.coral) : C.inkSoft} style={{ flex: 1, textDecorationLine: p.answer && !p.correct ? "line-through" : "none" }}>
                  {p.answer ?? "—"}
                </T>
                <T w="black" size={15} style={{ flex: 1 }}>
                  {p.correctAnswer}
                </T>
                <T w="bold" size={12} color={C.inkSoft}>
                  {p.seconds ? humanDuration(p.seconds) : "—"}
                </T>
              </Pressable>
              {isOpen ? (
                <View style={{ padding: 12, paddingTop: 0, gap: 10 }}>
                  {p.diagramSvg ? <Diagram svg={p.diagramSvg} /> : null}
                  <T w="semibold">{p.text}</T>
                  <View style={{ backgroundColor: C.pineLight, borderRadius: 14, padding: 12 }}>
                    <T w="extrabold" size={12} color={C.pineStrong}>
                      РАЗБОР
                    </T>
                    <T style={{ lineHeight: 22 }}>{p.explanation}</T>
                  </View>
                </View>
              ) : null}
            </View>
          );
        })}
      </Card>

      {data.part2.length ? <H2>Часть 2</H2> : null}
      {data.part2.map((p) => (
        <Part2Card key={p.problemId} mockId={data.id} p={p} hasTeacher={data.hasTeacher} onChanged={onChanged} />
      ))}

      <Button title="Решить другой вариант" onPress={() => router.replace("/mocks")} />
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <T size={12} color="rgba(255,255,255,0.6)">
        {label}
      </T>
      <T w="black" size={17} color={C.white}>
        {value}
      </T>
    </View>
  );
}

function Part2Card({ mockId, p, hasTeacher, onChanged }: { mockId: string; p: MockResultPayload["part2"][number]; hasTeacher: boolean; onChanged: () => void }) {
  const [showSolution, setShowSolution] = useState(false);
  const [saving, setSaving] = useState<number | null>(null);
  const badge =
    p.status === "pending"
      ? { t: "на проверке", bg: C.violetLight, c: C.violetText }
      : p.status === "unscored"
        ? { t: "оцени себя", bg: C.amberLight, c: C.amberText }
        : p.status === "empty"
          ? { t: "нет решения · 0", bg: C.paper, c: C.inkSoft }
          : { t: `${p.score} из ${p.max}`, bg: p.score === p.max ? C.pineLight : C.paper, c: p.score === p.max ? C.pineDark : C.ink };

  async function score(points: number) {
    setSaving(points);
    try {
      await api(`/api/m/mocks/${mockId}/self-score`, { body: { problemId: p.problemId, score: points } });
      onChanged();
    } catch (e) {
      Alert.alert("Не сохранилось", errorText(e));
    } finally {
      setSaving(null);
    }
  }

  return (
    <Card style={{ gap: 10 }}>
      <Row style={{ justifyContent: "space-between" }}>
        <T w="black" size={26}>
          {p.n}
          <T w="bold" size={12} color={C.inkSoft}>
            {"  "}до {p.max} {p.max === 1 ? "балла" : "баллов"}
          </T>
        </T>
        <Pill text={badge.t} bg={badge.bg} color={badge.c} />
      </Row>
      <T numberOfLines={showSolution ? undefined : 3}>{p.text}</T>
      {p.feedback ? (
        <T style={{ backgroundColor: C.pineLight, padding: 10, borderRadius: 12 }}>
          <T w="black" color={C.pineDark}>
            Репетитор:{" "}
          </T>
          {p.feedback}
        </T>
      ) : null}
      <Pressable onPress={() => setShowSolution((v) => !v)}>
        <T w="extrabold" color={C.pineStrong}>
          {showSolution ? "Скрыть эталон" : "Эталонное решение"}
        </T>
      </Pressable>
      {showSolution ? (
        <View style={{ backgroundColor: C.paper, borderRadius: 14, padding: 12, gap: 6 }}>
          {p.diagramSvg ? <Diagram svg={p.diagramSvg} /> : null}
          <T style={{ lineHeight: 22 }} selectable>
            {p.solution}
          </T>
          {p.explanation ? <T color={C.inkSoft}>{p.explanation}</T> : null}
        </View>
      ) : null}
      {!hasTeacher && p.criteria ? (
        <View style={{ gap: 6 }}>
          <T w="extrabold" size={13}>
            Оцени решение по критериям ФИПИ
          </T>
          {p.criteria.map((c) => {
            const checked = p.score === c.points && (p.status === "self" || p.status === "reviewed");
            return (
              <Pressable key={c.points} onPress={() => score(c.points)} style={{ flexDirection: "row", gap: 10, borderWidth: 2, borderColor: checked ? C.pine : C.lineSoft, backgroundColor: checked ? C.pineLight : C.white, borderRadius: 14, padding: 10 }}>
                <T w="black" size={16} style={{ width: 18 }}>
                  {saving === c.points ? "…" : c.points}
                </T>
                <T size={13} style={{ flex: 1 }}>
                  {c.text}
                </T>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </Card>
  );
}
