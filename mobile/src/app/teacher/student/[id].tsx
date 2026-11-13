import { useEffect, useState } from "react";
import { Alert, Share, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { errorText } from "@/lib/api";
import { plural } from "@/lib/hooks";
import { confirm, dayLabel, KIND_LABEL, mskKey, relDay, rub, useT, useTAction, type TStudent } from "@/lib/teacher";
import { Button, Card, Empty, ErrorBox, Header, Loading, Pill, ProgressBar, Row, Screen, T } from "@/components/ui";
import { Field } from "@/components/Field";
import { Avatar, Chip, Chips, DateStepper, LessonCard, Section, Seg, Sheet, Toggle } from "@/components/teacher";
import { C } from "@/theme";

type Tab = "overview" | "lessons" | "payments" | "hw";

function Overview({ d }: { d: TStudent }) {
  const { run, busy } = useTAction();
  const s = d.student;
  const [target, setTarget] = useState(s.targetScore ? String(s.targetScore) : "");
  const [notes, setNotes] = useState(d.notes);
  const [mockOpen, setMockOpen] = useState(false);
  const [mock, setMock] = useState({ score: "", takenAt: mskKey(), note: "" });
  const [parentOpen, setParentOpen] = useState(false);
  const [parent, setParent] = useState({ name: "", email: "", consent: false });
  useEffect(() => setNotes(d.notes), [d.notes]);

  return (
    <>
      <Row gap={8}>
        {[
          [String(d.stats.solved), "решено"],
          [`${d.stats.accuracy}%`, "точность"],
          [String(d.stats.activeDays7), "дней за неделю"],
        ].map(([v, l]) => (
          <Card key={l} style={{ flex: 1, alignItems: "center", paddingVertical: 12, paddingHorizontal: 6 }}>
            <T w="black" size={20}>
              {v}
            </T>
            <T size={11} color={C.inkSoft} style={{ textAlign: "center" }}>
              {l}
            </T>
          </Card>
        ))}
      </Row>
      <T size={12} color={C.inkSoft}>
        {d.stats.lastActiveAt ? `Последний раз занимался(ась) ${relDay(d.stats.lastActiveAt)}` : "Ещё не заходил(а) в приложение"}
        {d.weak.mistakes ? ` · в «Моих ошибках» ${d.weak.mistakes}` : ""}
      </T>
      {s.nudged ? null : (
        <Button title="Напомнить позаниматься" kind="secondary" small loading={busy === "nudge"} onPress={() => run("nudge", { studentId: s.id })} />
      )}

      <Section title="Цель и пробники" action="+ Пробник" onAction={() => setMockOpen(true)} />
      <Card style={{ gap: 10 }}>
        <Row>
          <View style={{ flex: 1 }}>
            <Field label="Цель, баллов ЕГЭ" value={target} onChangeText={setTarget} keyboardType="number-pad" maxLength={3} placeholder="например, 80" />
          </View>
          <Button
            title="Сохранить"
            small
            style={{ marginTop: 22 }}
            loading={busy === "setTargetScore"}
            disabled={target === (s.targetScore ? String(s.targetScore) : "")}
            onPress={() => run("setTargetScore", { studentId: s.id, targetScore: target })}
          />
        </Row>
        {d.mocks.length ? (
          d.mocks.map((m) => (
            <Row key={m.id}>
              <T w="black" size={18} style={{ width: 44 }}>
                {m.score}
              </T>
              <View style={{ flex: 1 }}>
                <T size={13}>{dayLabel(m.takenAt, { day: "numeric", month: "long", year: "numeric" })}</T>
                {m.note ? (
                  <T size={12} color={C.inkSoft}>
                    {m.note}
                  </T>
                ) : null}
              </View>
              <Button title="✕" kind="ghost" small onPress={() => confirm("Удалить результат?", `${m.score} баллов`, "Удалить", () => run("deleteMockScore", { mockId: m.id }))} />
            </Row>
          ))
        ) : (
          <T size={13} color={C.inkSoft}>
            Результатов пробников пока нет.
          </T>
        )}
      </Card>

      <Section title="Заметки" />
      <Card style={{ gap: 8 }}>
        <Field label="Видите только вы" value={notes} onChangeText={setNotes} multiline style={{ minHeight: 90, textAlignVertical: "top" }} placeholder="Что прошли, на что обратить внимание…" />
        <Button title="Сохранить заметки" small kind="secondary" disabled={notes === d.notes} loading={busy === "saveNotes"} onPress={() => run("saveNotes", { studentId: s.id, notes })} />
      </Card>

      <Section title="Родители" action="+ Пригласить" onAction={() => setParentOpen(true)} />
      {d.parents.length ? (
        d.parents.map((p) => (
          <Card key={p.id} style={{ paddingVertical: 12 }}>
            <T w="bold">{p.name}</T>
            <T size={12} color={C.inkSoft}>
              {p.email}
            </T>
          </Card>
        ))
      ) : (
        <T size={13} color={C.inkSoft}>
          Родитель сможет следить за прогрессом, журналом и заданиями.
        </T>
      )}

      <Button
        title="Удалить ученика"
        kind="ghost"
        onPress={() =>
          confirm("Удалить ученика?", `${s.name}: прогресс, задания, журнал и оплаты удалятся. Действие необратимо.`, "Удалить", async () => {
            const r = await run("deleteStudent", { studentId: s.id });
            if (r) router.back();
          })
        }
      />

      <Sheet open={mockOpen} onClose={() => setMockOpen(false)} title="Результат пробника">
        <Field label="Баллы (0–100)" value={mock.score} onChangeText={(v) => setMock({ ...mock, score: v })} keyboardType="number-pad" maxLength={3} />
        <DateStepper label="Дата" value={mock.takenAt} onChange={(v) => setMock({ ...mock, takenAt: v })} max={mskKey()} />
        <Field label="Комментарий" value={mock.note} onChangeText={(v) => setMock({ ...mock, note: v })} placeholder="необязательно" />
        <Button
          title="Сохранить"
          loading={busy === "addMockScore"}
          disabled={!mock.score}
          onPress={async () => {
            if (await run("addMockScore", { studentId: s.id, ...mock })) {
              setMockOpen(false);
              setMock({ score: "", takenAt: mskKey(), note: "" });
            }
          }}
        />
      </Sheet>

      <Sheet open={parentOpen} onClose={() => setParentOpen(false)} title="Пригласить родителя">
        <Field label="Имя родителя" value={parent.name} onChangeText={(v) => setParent({ ...parent, name: v })} />
        <Field label="Email родителя" value={parent.email} onChangeText={(v) => setParent({ ...parent, email: v })} keyboardType="email-address" autoCapitalize="none" />
        <Toggle label="Согласие родителя получено" value={parent.consent} onChange={(v) => setParent({ ...parent, consent: v })} />
        <Button
          title="Пригласить"
          loading={busy === "addParent"}
          disabled={!parent.name || !parent.email || !parent.consent}
          onPress={async () => {
            const r = (await run("addParent", { studentId: s.id, ...parent })) as { result?: { password?: string } } | null;
            if (!r) return;
            setParentOpen(false);
            setParent({ name: "", email: "", consent: false });
            const pw = r.result?.password;
            Alert.alert(
              "Родитель добавлен",
              pw ? `Вход: ${parent.email}\nПароль: ${pw}\n\nПередайте эти данные родителю.` : "Родитель уже был зарегистрирован — ученик привязан к его кабинету.",
              pw ? [{ text: "Отправить", onPress: () => void Share.share({ message: `Вход в Планиметрику: planimetrika.online\nEmail: ${parent.email}\nПароль: ${pw}` }) }, { text: "Готово" }] : undefined
            );
          }}
        />
      </Sheet>
    </>
  );
}

function Lessons({ d }: { d: TStudent }) {
  return (
    <>
      <Button title="+ Занятие" onPress={() => router.push({ pathname: "/teacher/lesson-new", params: { studentId: d.student.id } })} />
      {d.lessons.unmarked.length ? (
        <>
          <Section title="Отметьте прошедшие" />
          {d.lessons.unmarked.map((l) => (
            <LessonCard key={l.id} lesson={l} showDay from="student" />
          ))}
        </>
      ) : null}
      <Section title="Ближайшие" />
      {d.lessons.upcoming.length ? (
        d.lessons.upcoming.map((l) => <LessonCard key={l.id} lesson={l} showDay from="student" />)
      ) : (
        <T size={13} color={C.inkSoft}>
          Запланированных занятий нет.
        </T>
      )}
      <Section title="Журнал занятий" action="+ Отчёт" onAction={() => router.push({ pathname: "/teacher/log-new", params: { studentId: d.student.id } })} />
      {d.unreported.map((u) => (
        <Card key={u.lessonId} onPress={() => router.push({ pathname: "/teacher/log-new", params: { studentId: d.student.id, lessonId: u.lessonId } })} style={{ paddingVertical: 12, borderLeftWidth: 5, borderLeftColor: C.pine }}>
          <T w="bold">Записать отчёт: {dayLabel(mskKey(new Date(u.startsAt)), { day: "numeric", month: "long" })}</T>
          {u.topic ? (
            <T size={12} color={C.inkSoft}>
              {u.topic}
            </T>
          ) : null}
        </Card>
      ))}
      {d.logs.length ? (
        d.logs.map((l) => (
          <Card key={l.id} style={{ gap: 4 }}>
            <T w="black" size={13} color={C.inkSoft}>
              {dayLabel(l.date, { day: "numeric", month: "long" })}
            </T>
            <T w="black">{l.topic}</T>
            <T size={14}>{l.report}</T>
          </Card>
        ))
      ) : (
        <T size={13} color={C.inkSoft}>
          Отчёты о занятиях видят ученик и родители.
        </T>
      )}
    </>
  );
}

function Payments({ d }: { d: TStudent }) {
  const { run, busy } = useTAction();
  const s = d.student;
  const b = d.balance;
  const [price, setPrice] = useState(s.lessonPriceRub ? String(s.lessonPriceRub) : "");
  const [gprice, setGprice] = useState(s.groupLessonPriceRub ? String(s.groupLessonPriceRub) : "");
  const priceChanged = price !== (s.lessonPriceRub ? String(s.lessonPriceRub) : "") || gprice !== (s.groupLessonPriceRub ? String(s.groupLessonPriceRub) : "");
  return (
    <>
      <Card style={{ backgroundColor: b?.debt ? C.coralLight : C.pineLight, borderColor: b?.debt ? C.coral : C.pineMint, gap: 4 }}>
        <T w="black" size={18} color={b?.debt ? C.coralText : C.pineDark}>
          {b?.debt
            ? `Долг ${b.debt}`
            : b && (b.balanceRub ?? b.balance) > 0
              ? b.balanceRub !== null
                ? `Предоплата ${rub(b.balanceRub)}`
                : `Оплачено вперёд: ${b.balance} ${plural(b.balance, ["занятие", "занятия", "занятий"])}`
              : "Всё оплачено"}
        </T>
        {b ? (
          <T size={13} color={C.inkSoft}>
            Оплачено {b.paidLessons} {plural(b.paidLessons, ["занятие", "занятия", "занятий"])} ({rub(b.paidRub)}), засчитано {b.chargedLessons}
          </T>
        ) : null}
      </Card>
      <Button title="+ Оплата" onPress={() => router.push({ pathname: "/teacher/payment-new", params: { studentId: s.id } })} />
      {b?.debt ? (
        <Button title="Напомнить об оплате" kind="secondary" loading={busy === "sendPaymentReminder"} onPress={async () => {
          const r = await run("sendPaymentReminder", { studentId: s.id });
          if (r) Alert.alert("Готово", "Напоминание отправлено.");
        }} />
      ) : null}

      <Section title="История" />
      {d.payments.length ? (
        d.payments.map((p) => (
          <Card key={p.id} style={{ paddingVertical: 12 }}>
            <Row>
              <View style={{ flex: 1 }}>
                <T w="black">
                  {rub(p.amountRub)} · {p.lessonsCount} {plural(p.lessonsCount, ["занятие", "занятия", "занятий"])}
                </T>
                <T size={12} color={C.inkSoft}>
                  {dayLabel(p.paidAt, { day: "numeric", month: "long", year: "numeric" })}
                  {p.note ? ` · ${p.note}` : ""}
                </T>
              </View>
              <Button title="✕" kind="ghost" small onPress={() => confirm("Удалить оплату?", rub(p.amountRub), "Удалить", () => run("deletePayment", { paymentId: p.id, from: "student" }))} />
            </Row>
          </Card>
        ))
      ) : (
        <T size={13} color={C.inkSoft}>
          Оплат пока не было.
        </T>
      )}

      <Section title="Цена занятия" />
      <Card style={{ gap: 10 }}>
        <T size={12} color={C.inkSoft}>
          С ценой баланс считается в рублях. Без цены — в занятиях.
        </T>
        <Row>
          <View style={{ flex: 1 }}>
            <Field label="Индивидуальное, ₽" value={price} onChangeText={setPrice} keyboardType="number-pad" placeholder="—" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Групповое, ₽" value={gprice} onChangeText={setGprice} keyboardType="number-pad" placeholder="—" />
          </View>
        </Row>
        <Button title="Сохранить цену" small kind="secondary" disabled={!priceChanged} loading={busy === "saveLessonPrice"} onPress={() => run("saveLessonPrice", { studentId: s.id, lessonPriceRub: price, groupLessonPriceRub: gprice })} />
      </Card>
      <Card>
        <Toggle
          label="Напоминать об оплате"
          text="Ученику и родителям, когда оплаченные занятия заканчиваются"
          value={s.paymentReminders}
          onChange={(v) => run("setPaymentReminders", { studentId: s.id, enabled: v })}
        />
      </Card>
    </>
  );
}

function Homeworks({ d }: { d: TStudent }) {
  const { run, busy } = useTAction();
  const [quick, setQuick] = useState(false);
  const [count, setCount] = useState(10);
  const [due, setDue] = useState(7);
  return (
    <>
      <Row gap={8}>
        <Button title="+ Задание" style={{ flex: 1 }} onPress={() => router.push({ pathname: "/teacher/homework-new", params: { studentId: d.student.id } })} />
        <Button title="Быстрое ДЗ" kind="secondary" style={{ flex: 1 }} onPress={() => setQuick(true)} />
      </Row>
      {d.homeworks.length ? (
        d.homeworks.map((h) => (
          <Card key={h.id} style={{ gap: 6 }}>
            <Row>
              <View style={{ flex: 1 }}>
                <T w="black" numberOfLines={2}>
                  {h.title}
                </T>
                <T size={12} color={h.overdue && !h.complete ? C.coralText : C.inkSoft}>
                  {KIND_LABEL[h.kind] ?? "Задание"} · до {dayLabel(h.dueDate.slice(0, 10), { day: "numeric", month: "long" })}
                  {h.overdue && !h.complete ? " · просрочено" : ""}
                </T>
              </View>
              <Pill
                text={`${h.done}/${h.total}`}
                bg={h.complete ? C.pineLight : h.overdue ? C.coralLight : C.paper}
                color={h.complete ? C.pineDark : h.overdue ? C.coralText : C.inkSoft}
              />
            </Row>
            <ProgressBar pct={h.total ? Math.round((h.done / h.total) * 100) : 0} color={h.complete ? C.pine : C.amber} height={6} />
          </Card>
        ))
      ) : (
        <Empty title="Заданий пока нет" text="«Быстрое ДЗ» подберёт задачи по слабым местам ученика." />
      )}
      <Sheet open={quick} onClose={() => setQuick(false)} title="Быстрое ДЗ по слабым местам">
        <T size={13} color={C.inkSoft}>
          {d.weak.numbers.length
            ? `Подберём нерешённые задачи, в первую очередь по номерам ЕГЭ: ${d.weak.numbers.join(", ")}.`
            : "Подберём нерешённые задачи по тому, где ученик ошибается."}
        </T>
        <T w="extrabold" size={13} color={C.inkSoft}>
          Сколько задач
        </T>
        <Chips>
          {[5, 10, 15].map((n) => (
            <Chip key={n} label={String(n)} on={count === n} onPress={() => setCount(n)} />
          ))}
        </Chips>
        <T w="extrabold" size={13} color={C.inkSoft}>
          Срок
        </T>
        <Chips>
          {[3, 7, 14].map((n) => (
            <Chip key={n} label={`${n} ${plural(n, ["день", "дня", "дней"])}`} on={due === n} onPress={() => setDue(n)} />
          ))}
        </Chips>
        <Button
          title="Задать"
          loading={busy === "createQuickHomework"}
          onPress={async () => {
            const r = await run("createQuickHomework", { studentId: d.student.id, mode: "weak", count, dueDays: due });
            if (r) setQuick(false);
          }}
        />
      </Sheet>
    </>
  );
}

export default function TeacherStudent() {
  const { id, tab: tab0 } = useLocalSearchParams<{ id: string; tab?: Tab }>();
  const [tab, setTab] = useState<Tab>(tab0 && ["overview", "lessons", "payments", "hw"].includes(tab0) ? tab0 : "overview");
  const q = useT("student", { id });
  const d = q.data;
  const header = <Header title={d?.student.name ?? "Ученик"} subtitle={d?.student.email} />;
  if (q.isLoading && !d) return <Loading />;
  if (!d) return <Screen header={header}><ErrorBox message={errorText(q.error)} onRetry={() => q.refetch()} /></Screen>;
  return (
    <Screen header={header} onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <Row>
        <Avatar name={d.student.name} size={52} />
        <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {d.balance?.debt ? <Pill text={`Долг ${d.balance.debt}`} bg={C.coralLight} color={C.coralText} /> : null}
          {d.student.targetScore ? <Pill text={`Цель ${d.student.targetScore}`} bg={C.white} color={C.inkSoft} /> : null}
          {d.lessons.upcoming[0] ? <Pill text={`Занятие ${relDay(d.lessons.upcoming[0].startsAt)}`} bg={C.white} color={C.inkSoft} /> : null}
          {d.reviews ? <Pill text={`На проверке ${d.reviews}`} bg={C.violetLight} color={C.violetText} /> : null}
        </View>
      </Row>
      {d.reviews ? <Button title={`Проверить работы (${d.reviews})`} onPress={() => router.push({ pathname: "/teacher/reviews", params: { studentId: d.student.id } })} /> : null}
      <Seg
        value={tab}
        onChange={setTab}
        items={[
          ["overview", "Обзор"],
          ["lessons", "Занятия"],
          ["payments", "Оплаты"],
          ["hw", "ДЗ"],
        ]}
      />
      {tab === "overview" ? <Overview d={d} /> : tab === "lessons" ? <Lessons d={d} /> : tab === "payments" ? <Payments d={d} /> : <Homeworks d={d} />}
    </Screen>
  );
}
