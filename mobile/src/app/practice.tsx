import { useState } from "react";
import { Pressable, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorText } from "@/lib/api";
import type { MobileProblem } from "@/lib/types";
import { Button, Card, Empty, ErrorBox, Header, Loading, Pill, Row, Screen, T } from "@/components/ui";
import ProblemCard from "@/components/ProblemCard";
import { plural } from "@/lib/hooks";
import { C, R } from "@/theme";

interface MapPayload {
  total: number;
  rows: { n: number; total: number; solved: number }[];
}
interface SetPayload {
  n: number;
  total: number;
  solved: number;
  locked: number;
  items: { problem: MobileProblem; skillTitle: string }[];
}

const MASTERED_MIN = 5;

/**
 * Тренировка по номерам ЕГЭ: карта из 20 номеров → подборка задач номера
 * (сначала не решённые). Сервер: app/api/m/practice, lib/practice.ts.
 */
export default function PracticeScreen() {
  const [n, setN] = useState<number | null>(null);
  return n == null ? <MapView onPick={setN} /> : <SetView n={n} onBack={() => setN(null)} />;
}

function MapView({ onPick }: { onPick: (n: number) => void }) {
  const q = useQuery({ queryKey: ["practice-map"], queryFn: () => api<MapPayload>("/api/m/practice") });
  const header = <Header title="Тренировка по номерам" subtitle="Задания ЕГЭ от №1 до №20" />;
  if (q.isLoading && !q.data) return <Loading />;
  if (!q.data) return <Screen header={header}><ErrorBox message={errorText(q.error)} onRetry={() => q.refetch()} /></Screen>;
  const byN = new Map(q.data.rows.map((r) => [r.n, r]));
  const mastered = q.data.rows.filter((r) => r.solved >= Math.min(MASTERED_MIN, r.total)).length;
  return (
    <Screen header={header} onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <T color={C.inkSoft}>
        Выбери номер — получишь подборку его задач: сначала те, что ещё не решал. Освоено {mastered} из {q.data.total}.
      </T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {Array.from({ length: q.data.total }, (_, i) => i + 1).map((k) => {
          const r = byN.get(k);
          const done = r && r.solved >= Math.min(MASTERED_MIN, r.total);
          const started = r && r.solved > 0;
          return (
            <Pressable
              key={k}
              disabled={!r}
              onPress={() => onPick(k)}
              accessibilityLabel={`Задание ${k}`}
              style={({ pressed }) => ({
                width: "18%",
                aspectRatio: 1,
                borderRadius: R.input,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: !r ? C.white : done ? C.pineDark : started ? C.pineMint : C.grid,
                borderWidth: r ? 0 : 1.5,
                borderColor: C.line,
                borderStyle: r ? "solid" : "dashed",
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <T w="black" size={18} color={done ? C.white : r ? C.ink : C.inkSoft}>
                {k}
              </T>
              {r ? (
                <T size={10} color={done ? "rgba(255,255,255,0.8)" : C.inkSoft}>
                  {r.solved}/{r.total}
                </T>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

function SetView({ n, onBack }: { n: number; onBack: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["practice", n], queryFn: () => api<SetPayload>(`/api/m/practice?n=${n}`), staleTime: 0 });
  const [index, setIndex] = useState(0);
  const [solvedNow, setSolvedNow] = useState(false);
  const header = <Header title={`Задание №${n}`} onBack={onBack} />;
  if (q.isLoading && !q.data) return <Loading />;
  if (!q.data) return <Screen header={header}><ErrorBox message={errorText(q.error)} onRetry={() => q.refetch()} /></Screen>;
  const { items } = q.data;
  const item = items[index];

  if (!items.length) {
    const text =
      q.data.total === 0
        ? n >= 14
          ? "Это задание второй части — его решают с развёрнутым ответом. Тренируй его в уроках и пробниках."
          : "Задачи этого номера скоро появятся."
        : q.data.locked > 0
          ? "Задачи этого номера пока закрыты на твоём тарифе."
          : "Задач для тренировки пока нет.";
    return (
      <Screen header={header}>
        <Empty mood="thinking" title={`Задание №${n}`} text={text} action={<Button title="К номерам" kind="secondary" onPress={onBack} />} />
      </Screen>
    );
  }

  return (
    <Screen header={header}>
      {!item ? (
        <Empty
          mood="happy"
          title="Тренировка пройдена!"
          text="Ещё на шаг ближе к экзамену. Можно взять новую подборку или другой номер."
          action={
            <View style={{ gap: 10, alignSelf: "stretch" }}>
              <Button
                title="Ещё подборка"
                onPress={() => {
                  setIndex(0);
                  q.refetch();
                }}
              />
              <Button
                title="К номерам"
                kind="secondary"
                onPress={() => {
                  qc.invalidateQueries({ queryKey: ["practice-map"] });
                  onBack();
                }}
              />
            </View>
          }
        />
      ) : (
        <>
          <Row style={{ justifyContent: "space-between" }}>
            <T w="bold" color={C.inkSoft}>
              {index + 1} из {items.length} {plural(items.length, ["задачи", "задач", "задач"])}
            </T>
            <Pill text={item.skillTitle} bg={C.violetLight} color={C.violetText} />
          </Row>
          <Card>
            <ProblemCard key={item.problem.id} problem={item.problem} source="review" onSolved={() => setSolvedNow(true)} />
          </Card>
          <Button
            title={solvedNow ? "Дальше" : "Пропустить"}
            kind={solvedNow ? "primary" : "secondary"}
            onPress={() => {
              setSolvedNow(false);
              setIndex(index + 1);
              if (index + 1 >= items.length) qc.invalidateQueries({ queryKey: ["home"] });
            }}
          />
        </>
      )}
    </Screen>
  );
}
