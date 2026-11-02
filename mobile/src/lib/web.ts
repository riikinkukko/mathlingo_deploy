import * as WebBrowser from "expo-web-browser";
import { Linking, Platform } from "react-native";
import { api } from "./api";
import { API_URL } from "./config";

/**
 * Открыть раздел сайта уже вошедшим (кабинет репетитора и родителя, тариф,
 * настройки): сервер выдаёт одноразовую ссылку, сайт по ней ставит сессию.
 */
export async function openOnSite(path: string): Promise<void> {
  let url = `${API_URL}${path}`;
  try {
    url = (await api<{ url: string }>("/api/m/web-link", { body: { next: path } })).url;
  } catch {
    // без ссылки откроется страница входа сайта
  }
  if (Platform.OS === "web") {
    await Linking.openURL(url);
    return;
  }
  await WebBrowser.openBrowserAsync(url, {
    toolbarColor: "#FFFFFF",
    controlsColor: "#12804F",
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
  });
}

/** Публичные страницы сайта (оферта, политика) — без входа. */
export async function openPublic(path: string): Promise<void> {
  if (Platform.OS === "web") return void Linking.openURL(`${API_URL}${path}`);
  await WebBrowser.openBrowserAsync(`${API_URL}${path}`);
}
