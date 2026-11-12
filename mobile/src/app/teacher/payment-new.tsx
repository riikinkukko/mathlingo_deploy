import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { errorText } from "@/lib/api";
import { mskKey, useT, useTAction } from "@/lib/teacher";
import { Button, Card, ErrorBox, Header, Loading, Row, Screen, T } from "@/components/ui";
import { Field } from "@/components/Field";
import { Chip, Chips, DateStepper } from "@/components/teacher";
import { C } from "@/theme";

/** Записать оплату от ученика. */
export default function PaymentNew() {
  const p = useLocalSearchParams<{ studentId?: string }>();
  const { run, busy } = useTAction();
  const pay = useT("payments");
  const [studentId, setStudentId] = useState(p.studentId ?? "");
  const [amount, setAmount] = useState("");
  const [lessons, setLessons] = useState("1");
  const [paidAt, setPaidAt] = useState(mskKey());
  const [note, setNote] = useState("");
  const header = <Header title="Новая оплата" />;
  if (pay.isLoading && !pay.data) return <Loading />;
  if (!pay.data) return <Screen header={header}><ErrorBox message={errorText(pay.error)} onRetry={() => pay.refetch()} /></Screen>;
  const b = pay.data.balances.find((x) => x.studentId === studentId);

  function pickStudent(id: string) {
    setStudentId(id);
    const price = pay.data?.balances.find((x) => x.studentId === id)?.priceRub;
    if (price && !amount) setAmount(String(price * Number(lessons || 1)));
  }

  return (
    <Screen header={header}>
      {!p.studentId ? (
        <Card style={{ gap: 8 }}>
          <T w="extrabold" size={13} color={C.inkSoft}>
            Ученик
          </T>
          <Chips>
            {pay.data.balances.map((s) => (
              <Chip key={s.studentId} label={s.name} on={studentId === s.studentId} onPress={() => pickStudent(s.studentId)} />
            ))}
          </Chips>
        </Card>
      ) : (
        <T w="black" size={18}>
          {b?.name}
        </T>
      )}
      <Card style={{ gap: 12 }}>
        <Row>
          <View style={{ flex: 3 }}>
            <Field label="Сумма, ₽" value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder="3000" />
          </View>
          <View style={{ flex: 2 }}>
            <Field
              label="Занятий"
              value={lessons}
              onChangeText={(v) => {
                setLessons(v);
                if (b?.priceRub && Number(v) > 0) setAmount(String(b.priceRub * Number(v)));
              }}
              keyboardType="number-pad"
            />
          </View>
        </Row>
        {b?.priceRub ? (
          <T size={12} color={C.inkSoft}>
            Цена занятия — {b.priceRub} ₽
          </T>
        ) : null}
        <DateStepper label="Дата оплаты" value={paidAt} onChange={setPaidAt} max={mskKey()} />
        <Field label="Комментарий" value={note} onChangeText={setNote} placeholder="необязательно" maxLength={200} />
      </Card>
      <Button
        title="Сохранить"
        disabled={!studentId || !amount}
        loading={!!busy}
        onPress={async () => {
          if (await run("addPayment", { studentId, amountRub: amount, lessonsCount: lessons, paidAt, note })) router.back();
        }}
      />
    </Screen>
  );
}
