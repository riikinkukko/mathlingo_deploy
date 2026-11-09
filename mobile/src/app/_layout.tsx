import { useEffect } from "react";
import { Stack, router, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import * as WebBrowser from "expo-web-browser";
import NetInfo from "@react-native-community/netinfo";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import {
  useFonts,
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  Nunito_900Black,
} from "@expo-google-fonts/nunito";
import { AuthProvider, useAuth } from "@/lib/auth";
import { persister, queryClient } from "@/lib/query";
import { flushQueue } from "@/lib/attempt-queue";
import { registerForPush, routeForLink } from "@/lib/push";
import { openOnSite } from "@/lib/web";
import { C } from "@/theme";

export { ErrorBoundary } from "expo-router";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black });
  if (!fontsLoaded) return null;
  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: 7 * 24 * 3600_000 }}>
        <AuthProvider>
          <StatusBar style="dark" />
          <RootNavigator />
        </AuthProvider>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { state } = useAuth();
  const signedIn = state.status === "signedIn";
  const role = signedIn ? state.user.role : null;

  useEffect(() => {
    if (state.status !== "loading") SplashScreen.hideAsync().catch(() => {});
  }, [state.status]);

  // Стартовый экран по роли: защищённые группы сами не перенаправляют с «/».
  const segments = useSegments() as string[];
  const first = segments[0] ?? "";
  useEffect(() => {
    if (state.status === "loading") return;
    if (!signedIn) {
      if (first !== "(auth)") router.replace("/login");
    } else if (role === "STUDENT") {
      if (first === "(auth)" || first === "staff") router.replace("/");
    } else if (first !== "staff" && first !== "notifications") {
      router.replace("/staff");
    }
  }, [state.status, signedIn, role, first]);

  // Ответы, накопленные без сети, — на сервер при запуске и при появлении связи.
  useEffect(() => {
    if (!signedIn) return;
    flushQueue().catch(() => {});
    return NetInfo.addEventListener((s) => {
      if (s.isConnected) flushQueue().catch(() => {});
    });
  }, [signedIn]);

  // Push: регистрация устройства и переход по нажатию на уведомление.
  useEffect(() => {
    if (!signedIn || !role) return;
    registerForPush().catch(() => {});
    const open = (link: string) => {
      const target = routeForLink(link, role);
      if ("app" in target) router.push(target.app as never);
      else openOnSite(target.web).catch(() => {});
    };
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const link = (r.notification.request.content.data as { link?: string } | undefined)?.link;
      if (link) open(link);
    });
    return () => sub.remove();
  }, [signedIn, role]);

  useEffect(() => {
    WebBrowser.warmUpAsync().catch(() => {});
    return () => {
      WebBrowser.coolDownAsync().catch(() => {});
    };
  }, []);

  if (state.status === "loading") return null;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.paper }, animation: "slide_from_right" }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={role === "STUDENT"}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="skill/[id]" />
        <Stack.Screen name="mock/[id]" options={{ gestureEnabled: false }} />
        <Stack.Screen name="homework/index" />
        <Stack.Screen name="homework/[id]" />
        <Stack.Screen name="topics" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
        <Stack.Screen name="achievements" />
        <Stack.Screen name="questions" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && role !== "STUDENT"}>
        <Stack.Screen name="staff" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="notifications" />
      </Stack.Protected>
    </Stack>
  );
}
