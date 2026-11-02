import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/** Токен сессии — в защищённом хранилище (Keychain / Keystore); в вебе — localStorage. */
const KEY = "planimetrika_session";

export async function loadToken(): Promise<string | null> {
  try {
    if (Platform.OS === "web") return globalThis.localStorage?.getItem(KEY) ?? null;
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

export async function saveToken(token: string | null): Promise<void> {
  try {
    if (Platform.OS === "web") {
      if (token) globalThis.localStorage?.setItem(KEY, token);
      else globalThis.localStorage?.removeItem(KEY);
      return;
    }
    if (token) await SecureStore.setItemAsync(KEY, token);
    else await SecureStore.deleteItemAsync(KEY);
  } catch {
    // хранилище недоступно — сессия просто не переживёт перезапуск
  }
}
