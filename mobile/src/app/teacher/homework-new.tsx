import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { errorText } from "@/lib/api";
import { plural } from "@/lib/hooks";
import { confirm, KIND_LABEL, mskKey, useT, useTAction, type TBuilder } from "@/lib/teacher";
import { Button, Card, Empty, ErrorBox, Header, Loading, Pill, Row, Screen, T } from "@/components/ui";
import { Field } from "@/components/Field";
import { Diagram } from "@/components/Svg";
import { Chip, Chips, DateStepper, Section, Seg, Sheet, Toggle } from "@/components/teacher";
import { C } from "@/theme";

type Target = { studentId?: string; groupId?: string };
const targetFields = (t: Target) => (t.groupId ? { groupId: t.groupId } : { studentId: t.studentId });

/** Кому задать — если открыли без адресата. */
function PickTarget() {
  const q = useT("home");
  if (q.isLoading && !q.data) return <Loading />;
  if (!q.data) return <ErrorBox message={errorText(q.error)} onRetry={() => q.refetch()} />;
  const groups = q.data.groups.filter((g) => g.members.length > 0);
  return (
    <>
      <T color={C.inkSoft}>Кому задать?</T>
      {q.data.students.length === 0 ? <Empty title="Сначала добавьте ученика" /> : null}
      {groups.map((g) => (
        <Card key={g.id} onPress={() => router.setParams({ groupId: g.id })} style={{ backgroundColor: C.violetLight, borderColor: C.violetLight }}>
          <T w="black">Группа «{g.name}» · {g.members.length} уч.</T>
        </Card>
      ))}
      {q.data.students.map((s) => (
        <Card key={s.id} onPress={() => router.setParams({ studentId: s.id })}>
          <T w="black">{s.name}</T>
        </Card>
      ))}
    </>
  );
}

function Templates({ b, target }: { b: TBuilder; target: Target }) {
  const { run, busy } = useTAction();
  const [due, setDue] = useState(b.defaultDue);
  if (!b.templates.length) return null;
  return (
    <>
      <Section title="Мои шаблоны" />
      <DateStepper label="Срок сдачи" value={due} onChange={setDue} min={mskKey()} />
      {b.templates.map((t) => (
        <Card key={t.id} style={{ gap: 8 }}>
          <Row>
            <View style={{ flex: 1 }}>
              <T w="black">{t.title}</T>
              <T size={12} color={C.inkSoft}>
                {KIND_LABEL[t.kind] ?? "Задание"} · {t.count} {plural(t.count, ["задача", "задачи", "задач"])}
                {t.timeLimitMinutes ? ` · ${t.timeLimitMinutes} мин` : ""}
                {!t.allowHints ? " · без подсказок" : ""}
              </T>
            </View>
            <Button title="✕" kind="ghost" small onPress={() => confirm("Удалить шаблон?", t.title, "Удалить", () => run("deleteTemplate", { templateId: t.id }))} />
          </Row>
          <Button
            title="Выдать"
            small
            loading={busy === t.id}
            onPress={async () => {
              const r = await run(
                "createHomework",
                { ...targetFields(target), templateId: t.id, title: t.title, kind: t.kind, allowHints: t.allowHints, timeLimitMinutes: t.timeLimitMinutes ?? undefined, dueDate: due },
                { key: t.id }
              );
              if (r) router.back();
            }}
          />
        </Card>
      ))}
    </>
  );
}

function Quick({ b, target }: { b: TBuilder; target: Target }) {
  const { run, busy } = useTAction();
  const [mode, setMode] = useState<"weak" | "numbers">(b.weak && (b.weak.mistakes || b.weak.numbers.length) ? "weak" : "numbers");
  const [nums, setNums] = useState<Set<number>>(new Set());
  const [count, setCount] = useState(10);
  const [due, setDue] = useState(7);
  return (
    <>
      <Section title="Быстрое задание" />
      <Card style={{ gap: 10 }}>
        {b.weak ? <Seg value={mode} onChange={setMode} items={[["weak", "По слабым местам"], ["numbers", "По номерам ЕГЭ"]]} /> : null}
        {mode === "weak" && b.weak ? (
          <T size={13} color={C.inkSoft}>
            {b.weak.numbers.length ? `В первую очередь номера: ${b.weak.numbers.join(", ")}.` : "Нерешённые задачи там, где ученик ошибается."}
          </T>
        ) : (
          <Chips>
            {b.examNumbers.map((n) => (
              <Chip
                key={n}
                label={`№${n}`}
                on={nums.has(n)}
                onPress={() =>
                  setNums((s) => {
                    const x = new Set(s);
                    if (x.has(n)) x.delete(n);
                    else x.add(n);
                    return x;
                  })
                }
              />
            ))}
          </Chips>
        )}
        <Row gap={6}>
          <T w="extrabold" size={13} color={C.inkSoft} style={{ width: 90 }}>
            Задач
          </T>
          {[5, 10, 15].map((n) => (
            <Chip key={n} label={String(n)} on={count === n} onPress={() => setCount(n)} />
          ))}
        </Row>
        <Row gap={6}>
          <T w="extrabold" size={13} color={C.inkSoft} style={{ width: 90 }}>
            Срок
          </T>
          {[3, 7].map((n) => (
            <Chip key={n} label={`${n} дн.`} on={due === n} onPress={() => setDue(n)} />
          ))}
        </Row>
        <Button
          title="Задать"
          loading={busy === "createQuickHomework"}
          disabled={mode === "numbers" && nums.size === 0}
          onPress={async () => {
            const r = await run("createQuickHomework", { ...targetFields(target), mode: b.weak ? mode : "numbers", numbers: [...nums], count, dueDays: due });
            if (r) router.back();
          }}
        />
      </Card>
    </>
  );
}

function SkillProblems({ skillId, selected, toggle }: { skillId: string; selected: string[]; toggle: (id: string) => void }) {
  const q = useT("problems", { skillId });
  if (q.isLoading && !q.data) return <Loading />;
  if (!q.data) return <ErrorBox message={errorText(q.error)} onRetry={() => q.refetch()} />;
  if (!q.data.problems.length) return <T color={C.inkSoft}>В этом навыке пока нет задач.</T>;
  return (
    <>
      {q.data.problems.map((p) => {
        const on = selected.includes(p.id);
        return (
          <Pressable key={p.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggle(p.id)}>
            <Card style={{ gap: 6, borderWidth: 2, borderColor: on ? C.pineStrong : C.lineSoft, backgroundColor: on ? C.pineLight : C.white }}>
              <Row>
                <T w="black" size={18} color={on ? C.pineStrong : C.line}>
                  {on ? "✓" : "○"}
                </T>
                {p.egeTaskNumber ? <Pill text={`№${p.egeTaskNumber}`} bg={C.violetLight} color={C.violetText} /> : null}
                {p.answerType === "DETAILED" ? <Pill text="развёрнутая" bg={C.amberLight} color={C.amberText} /> : null}
              </Row>
              <T size={14} numberOfLines={6}>
                {p.text}
              </T>
              {p.diagramSvg ? <Diagram svg={p.diagramSvg} maxHeight={140} /> : null}
            </Card>
          </Pressable>
        );
      })}
    </>
  );
}

function Manual({ b, target }: { b: TBuilder; target: Target }) {
  const { run, busy } = useTAction();
  const [selected, setSelected] = useState<string[]>([]);
  const [skill, setSkill] = useState<{ id: string; title: string } | null>(null);
  const [openTopic, setOpenTopic] = useState<string | null>(null);
  const [form, setForm] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"homework" | "test" | "exam">("homework");
  const [due, setDue] = useState(b.defaultDue);
  const [hints, setHints] = useState(true);
  const [limit, setLimit] = useState("");
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 60 ? s : [...s, id]));

  return (
    <>
      <Section title="Собрать из банка задач" />
      {b.topics.map((t) => (
        <Card key={t.id} style={{ gap: 6 }}>
          <Pressable onPress={() => setOpenTopic(openTopic === t.id ? null : t.id)} accessibilityRole="button">
            <Row>
              <T w="black" style={{ flex: 1 }}>
                {t.title}
              </T>
              <T w="black" color={C.inkSoft}>
                {openTopic === t.id ? "▴" : "▾"}
              </T>
            </Row>
          </Pressable>
          {openTopic === t.id
            ? t.chapters.map((c) => (
                <View key={c.id} style={{ gap: 4, marginTop: 4 }}>
                  <T w="extrabold" size={12} color={C.inkSoft}>
                    {c.title.toUpperCase()}
                  </T>
                  {c.skills.map((s) => (
                    <Pressable key={s.id} onPress={() => setSkill(s)} style={{ paddingVertical: 8 }}>
                      <T color={C.pineStrong} w="bold">
                        {s.title} ›
                      </T>
                    </Pressable>
                  ))}
                </View>
              ))
            : null}
        </Card>
      ))}
      {selected.length ? (
        <Button title={`Дальше · выбрано ${selected.length}`} onPress={() => setForm(true)} />
      ) : null}

      <Sheet open={!!skill} onClose={() => setSkill(null)} title={skill?.title ?? ""}>
        {skill ? <SkillProblems skillId={skill.id} selected={selected} toggle={toggle} /> : null}
        <Button title={selected.length ? `Готово · выбрано ${selected.length}` : "Закрыть"} onPress={() => setSkill(null)} />
      </Sheet>

      <Sheet open={form} onClose={() => setForm(false)} title={`Задание · ${selected.length} ${plural(selected.length, ["задача", "задачи", "задач"])}`}>
        <Field label="Название" value={title} onChangeText={setTitle} maxLength={120} placeholder="например, Планиметрия, №1" />
        <Seg value={kind} onChange={setKind} items={[["homework", "Домашка"], ["test", "Контрольная"], ["exam", "Пробник"]]} />
        <DateStepper label="Срок сдачи" value={due} onChange={setDue} min={mskKey()} />
        <Toggle label="Подсказки и разбор" text="Выключите для контрольной в режиме экзамена" value={hints} onChange={setHints} />
        <Field label="Лимит времени, мин (необязательно)" value={limit} onChangeText={setLimit} keyboardType="number-pad" maxLength={3} />
        <Button title="Очистить выбор" kind="ghost" small onPress={() => (setSelected([]), setForm(false))} />
        <Button
          title="Выдать"
          disabled={!title.trim()}
          loading={busy === "createHomework"}
          onPress={async () => {
            const r = await run("createHomework", { ...targetFields(target), problemIds: selected, title, kind, dueDate: due, allowHints: hints, timeLimitMinutes: limit || undefined });
            if (r) {
              setForm(false);
              router.back();
            }
          }}
        />
      </Sheet>
    </>
  );
}

export default function HomeworkNew() {
  const p = useLocalSearchParams<{ studentId?: string; groupId?: string }>();
  const target: Target = useMemo(() => (p.groupId ? { groupId: p.groupId } : p.studentId ? { studentId: p.studentId } : {}), [p.groupId, p.studentId]);
  const has = !!(target.groupId || target.studentId);
  const q = useT("builder", target, has);
  const b = q.data;
  const header = <Header title="Новое задание" subtitle={b ? (b.to.kind === "group" ? `Группа «${b.to.name}»` : b.to.name) : undefined} />;
  if (!has) return <Screen header={header}><PickTarget /></Screen>;
  if (q.isLoading && !b) return <Loading />;
  if (!b) return <Screen header={header}><ErrorBox message={errorText(q.error)} onRetry={() => q.refetch()} /></Screen>;
  return (
    <Screen header={header}>
      <Quick b={b} target={target} />
      <Templates b={b} target={target} />
      <Manual b={b} target={target} />
    </Screen>
  );
}
