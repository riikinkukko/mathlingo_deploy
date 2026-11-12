import { useEffect, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { errorText } from "@/lib/api";
import { plural } from "@/lib/hooks";
import { dayLabel, rub, useT, useTAction } from "@/lib/teacher";
import { Button, Card, Empty, ErrorBox, Loading, Pill, Row, Screen, T } from "@/components/ui";
import { Field } from "@/components/Field";
import { Section, Toggle } from "@/components/teacher";
import { C } from "@/theme";

const MONTHS = ["январе", "феврале", "марте", "апреле", "мае", "июне", "июле", "августе", "сентябре", "октябре", "ноябре", "декабре"];

/** Оплаты занятий от учеников (не тариф платформы). */
export default function TeacherPayments() {
  const q = useT("payments");
  const { run, busy } = useTAction();
  const d = q.data;
  const [instr, setInstr] = useState("");
  useEffect(() => setInstr(d?.paymentInstructions ?? ""), [d?.paymentInstructions]);
  if (q.isLoading && !d) return <Loading />;
  if (!d) return <Screen><ErrorBox message={errorText(q.error)} onRetry={() => q.refetch()} /></Screen>;
  const debtors = d.balances.filter((b) => b.debt);
  const month = new Date().getMonth();

  return (
    <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <Row>
        <T w="black" size={24} style={{ flex: 1 }}>
          Оплаты
        </T>
        {d.balances.length ? <Button title="+ Оплата" small onPress={() => router.push("/teacher/payment-new")} /> : null}
      </Row>
      <Row gap={8}>
        <Card style={{ flex: 1, gap: 2 }}>
          <T size={12} color={C.inkSoft}>
            В {MONTHS[month]}
          </T>
          <T w="black" size={20}>
            {rub(d.incomeThis)}
          </T>
        </Card>
        <Card style={{ flex: 1, gap: 2 }}>
          <T size={12} color={C.inkSoft}>
            В {MONTHS[(month + 11) % 12]}
          </T>
          <T w="black" size={20} color={C.inkSoft}>
            {rub(d.incomePrev)}
          </T>
        </Card>
      </Row>

      {d.balances.length === 0 ? <Empty title="Пока нет учеников" text="Оплаты появятся, когда добавите учеников." /> : null}
      {d.balances.length ? <Section title={debtors.length ? `Балансы · должников ${debtors.length}` : "Балансы"} /> : null}
      {d.balances.map((b) => (
        <Card key={b.studentId} onPress={() => router.push(`/teacher/student/${b.studentId}?tab=payments`)} style={{ paddingVertical: 12 }}>
          <Row>
            <View style={{ flex: 1 }}>
              <T w="black">{b.name}</T>
              <T size={12} color={C.inkSoft}>
                {b.lastPaidAt ? `последняя оплата ${dayLabel(b.lastPaidAt.slice(0, 10), { day: "numeric", month: "long" })}` : "оплат не было"}
              </T>
            </View>
            {b.debt ? (
              <Pill text={`долг ${b.debt}`} bg={C.coralLight} color={C.coralText} />
            ) : (b.balanceRub ?? b.balance) > 0 ? (
              <Pill text={b.balanceRub !== null ? `+${rub(b.balanceRub)}` : `+${b.balance} ${plural(b.balance, ["занятие", "занятия", "занятий"])}`} />
            ) : (
              <Pill text="0" bg={C.paper} color={C.inkSoft} />
            )}
          </Row>
        </Card>
      ))}

      {d.recent.length ? <Section title="Последние оплаты" /> : null}
      {d.recent.slice(0, 15).map((p) => (
        <Row key={p.id} style={{ paddingHorizontal: 4 }}>
          <T size={14} style={{ flex: 1 }} numberOfLines={1}>
            {p.name}
          </T>
          <T size={12} color={C.inkSoft}>
            {dayLabel(p.paidAt, { day: "numeric", month: "short" })}
          </T>
          <T w="black" size={14} style={{ minWidth: 80, textAlign: "right" }}>
            {rub(p.amountRub)}
          </T>
        </Row>
      ))}

      <Section title="Настройки" />
      <Card style={{ gap: 10 }}>
        <Toggle
          label="Пропуск оплачивается"
          text="«Не пришёл» засчитывается как проведённое занятие"
          value={d.chargeMissed}
          onChange={(v) => run("saveChargeMissed", { chargeMissed: v })}
        />
        <Field
          label="Как вам заплатить (видят ученик и родители)"
          value={instr}
          onChangeText={setInstr}
          multiline
          maxLength={500}
          placeholder="Перевод по номеру телефона…"
          style={{ minHeight: 80, textAlignVertical: "top" }}
        />
        <Button
          title="Сохранить"
          small
          kind="secondary"
          disabled={instr === d.paymentInstructions}
          loading={busy === "savePaymentInstructions"}
          onPress={() => run("savePaymentInstructions", { paymentInstructions: instr })}
        />
      </Card>
    </Screen>
  );
}
