import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import { errorText } from "@/lib/api";
import { openPublic } from "@/lib/web";
import { Button, Card, H1, Row, T } from "@/components/ui";
import { Field } from "@/components/Field";
import { Icon } from "@/components/Svg";
import { C } from "@/theme";

function Link({ path, children }: { path: string; children: string }) {
  return (
    <T w="bold" size={13} color={C.pineStrong} onPress={() => openPublic(path)} suppressHighlighting>
      {children}
    </T>
  );
}

export default function RegisterScreen() {
  const { register } = useAuth();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await register({ name, email, password, consent });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.paper }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: insets.top + 20, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <T w="bold" color={C.inkSoft}>
            ← Назад ко входу
          </T>
        </Pressable>
        <H1>Новый аккаунт</H1>
        <T color={C.inkSoft}>Для ученика. Репетиторы регистрируются на сайте planimetrika.online.</T>
        <Card style={{ gap: 14 }}>
          <Field label="Имя" value={name} onChangeText={setName} autoComplete="name" textContentType="name" placeholder="Как к тебе обращаться" />
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" placeholder="you@mail.ru" />
          <Field label="Пароль" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" placeholder="Минимум 6 символов" />
          <Pressable onPress={() => setConsent((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: consent }}>
            <Row style={{ alignItems: "flex-start" }}>
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  borderWidth: 2,
                  borderColor: consent ? C.pine : C.line,
                  backgroundColor: consent ? C.pine : C.white,
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: 2,
                }}
              >
                {consent ? <Icon name="Check" size={14} color={C.white} /> : null}
              </View>
              <T size={13} color={C.inkSoft} style={{ flex: 1 }}>
                Я согласен(на) с <Link path="/legal/terms">Пользовательским соглашением</Link>,{" "}
                <Link path="/legal/privacy">Политикой конфиденциальности</Link> и даю{" "}
                <Link path="/legal/consent">согласие на обработку персональных данных</Link>. Если мне ещё нет 14 лет,
                регистрацию за меня выполняет родитель или законный представитель.
              </T>
            </Row>
          </Pressable>
          {error ? (
            <T w="bold" color={C.coralText} style={{ backgroundColor: C.coralLight, padding: 10, borderRadius: 12 }}>
              {error}
            </T>
          ) : null}
          <Button title="Создать аккаунт" onPress={submit} loading={busy} disabled={!name || !email || password.length < 6 || !consent} />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
