import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { api } from "./api";

/**
 * Push-уведомления: новая домашка, проверенное решение, напоминание о серии —
 * всё, что сайт пишет в колокольчик, приходит и на телефон (сервер шлёт через
 * Expo Push, lib/push.ts на сервере). Нужен projectId EAS — он появляется в
 * app.json после `npx eas-cli init`.
 */
const TOKEN_KEY = "planimetrika_push_token";

export async function registerForPush(): Promise<void> {
  if (Platform.OS === "web" || !Device.isDevice) return;
  const projectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) return;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Уведомления",
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: "#1CAE6B",
    });
  }
  const current = await Notifications.getPermissionsAsync();
  let granted = current.granted;
  if (!granted && current.canAskAgain) granted = (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return;

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await api("/api/m/push-token", { body: { token, platform: Platform.OS } });
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function unregisterPush(): Promise<void> {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (!token) return;
  await AsyncStorage.removeItem(TOKEN_KEY);
  await api("/api/m/push-token", { method: "DELETE", body: { token } });
}

/**
 * Куда вести по уведомлению: ссылки сайта → экраны приложения. То, чего в
 * приложении нет (кабинет репетитора, оплаты), открывается на сайте.
 */
export function routeForLink(link: string, role: string): { app: string } | { web: string } {
  const path = link.split("?")[0];
  if (role === "STUDENT") {
    const mock = /^\/student\/mock\/([\w-]+)/.exec(path);
    if (mock) return { app: `/mock/${mock[1]}` };
    const skill = /^\/student\/skill\/([\w-]+)/.exec(path);
    if (skill) return { app: `/skill/${skill[1]}` };
    const hw = /^\/student\/homework\/([\w-]+)/.exec(path);
    if (hw) return { app: `/homework/${hw[1]}` };
    if (path.startsWith("/student/homework")) return { app: "/homework" };
    if (path.startsWith("/student/review")) return { app: "/review" };
    if (path.startsWith("/student/mistakes")) return { app: "/mistakes" };
    if (path.startsWith("/student/mock")) return { app: "/mocks" };
    if (path === "/student" || path === "") return { app: "/" };
  }
  return { web: link || `/${role.toLowerCase()}` };
}
