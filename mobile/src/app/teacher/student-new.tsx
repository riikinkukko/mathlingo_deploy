import { useState } from "react";
import { say } from "@/lib/alert";
import { Share } from "react-native";
import { router } from "expo-router";
import { useT, useTAction } from "@/lib/teacher";
import { Button, Card, Header, Screen, T } from "@/components/ui";
import { Field } from "@/components/Field";
import { Toggle } from "@/components/teacher";
import { C } from "@/theme";

type Res = { success?: boolean; invited?: boolean; password?: string; email?: string; name?: string; studentId?: string };

/** Добавить ученика: новый аккаунт или приглашение уже зарегистрированному. */
export default function StudentNew() {
  const { run, busy } = useTAction();
  const home = useT("home", {}, false).data;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  return (
    <Screen header={<Header title="Новый ученик" />}>
      <Card style={{ gap: 12 }}>
        <Field label="Имя и фамилия" value={name} onChangeText={setName} placeholder="Иван Иванов" maxLength={80} />
        <Field label="Email ученика" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="ivan@example.ru" />
        <Field label="Пароль" value={password} onChangeText={setPassword} autoCapitalize="none" placeholder="оставьте пустым — придумаем сами" />
        <Toggle label="Согласие получено" text="Ученика (или его представителя) — на обработку персональных данных" value={consent} onChange={setConsent} />
      </Card>
      {home && !home.emailVerified && home.plan.source !== "owner" ? (
        <Card style={{ backgroundColor: C.amberLight, borderColor: C.amber }}>
          <T size={13} w="bold">
            Пока email не подтверждён, можно добавить 2 учеников. Ссылка для подтверждения — в письме после регистрации.
          </T>
        </Card>
      ) : null}
      <T size={12} color={C.inkSoft}>
        Если ученик уже зарегистрирован сам, ему уйдёт приглашение — он подтвердит его в своём кабинете.
      </T>
      <Button
        title="Добавить"
        disabled={!name.trim() || !email.trim() || !consent}
        loading={!!busy}
        onPress={async () => {
          const r = (await run("addStudent", { name, email, password, consent })) as { result?: Res } | null;
          if (!r) return;
          const res = r.result ?? {};
          router.back();
          if (res.invited) {
            say("Приглашение отправлено", `${res.name} увидит его в своём кабинете.`);
          } else if (res.password) {
            const msg = `Вход в Планиметрику: planimetrika.online\nEmail: ${res.email}\nПароль: ${res.password}`;
            say("Ученик добавлен", `Передайте ученику данные для входа:\n\n${res.email}\n${res.password}`, [
              { text: "Отправить", onPress: () => void Share.share({ message: msg }) },
              { text: "Готово" },
            ]);
          }
        }}
      />
    </Screen>
  );
}
