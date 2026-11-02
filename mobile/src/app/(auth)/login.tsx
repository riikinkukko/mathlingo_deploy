import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import { errorText } from "@/lib/api";
import { openPublic } from "@/lib/web";
import { Button, Card, H1, T } from "@/components/ui";
import { Mascot } from "@/components/Svg";
import { Field } from "@/components/Field";
import { C } from "@/theme";

export default function LoginScreen() {
  const { login } = useAuth();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.paper }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: insets.top + 32, gap: 18 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: "center", gap: 6 }}>
          <Mascot mood="wink" size={110} />
          <H1 style={{ textAlign: "center" }}>Планиметрика</H1>
          <T color={C.inkSoft} style={{ textAlign: "center" }}>
            Подготовка к профильному ЕГЭ по математике — по 10 минут в день
          </T>
        </View>
        <Card style={{ gap: 14 }}>
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" placeholder="you@mail.ru" />
          <Field label="Пароль" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" placeholder="••••••" onSubmitEditing={submit} returnKeyType="go" />
          {error ? (
            <T w="bold" color={C.coralText} style={{ backgroundColor: C.coralLight, padding: 10, borderRadius: 12 }}>
              {error}
            </T>
          ) : null}
          <Button title="Войти" onPress={submit} loading={busy} disabled={!email || !password} />
          <Pressable onPress={() => openPublic("/forgot-password")} hitSlop={8} style={{ alignSelf: "center" }}>
            <T w="bold" size={14} color={C.pineStrong}>
              Забыли пароль?
            </T>
          </Pressable>
        </Card>
        <View style={{ alignItems: "center", gap: 10 }}>
          <T color={C.inkSoft}>Ещё нет аккаунта?</T>
          <Button title="Создать аккаунт" kind="secondary" onPress={() => router.push("/register")} style={{ alignSelf: "stretch" }} />
          <T size={12} color={C.inkSoft} style={{ textAlign: "center" }}>
            Репетитор или родитель? Войдите тем же email и паролем, что на сайте.
          </T>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
